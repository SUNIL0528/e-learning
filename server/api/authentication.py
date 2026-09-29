from dataclasses import dataclass
import logging

import jwt
from django.conf import settings
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .models import LearnerProfile


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CognitoPrincipal:
    """Small request user object backed by a verified Cognito access token."""

    user_id: str
    username: str
    email: str = ""

    @property
    def id(self):
        return self.user_id

    @property
    def is_authenticated(self):
        return True


class CognitoJWTAuthentication(BaseAuthentication):
    """Verify Cognito access tokens using the user pool's rotating JWKS keys."""

    # Keep one client per issuer.  PyJWKClient caches the pool's signing keys;
    # a fresh client is created below if Cognito rotates a key or the pool was
    # changed while Django was still running.
    _jwks_clients = {}
    # Temporarily allow the same account to be used on multiple devices.
    # The active-session database field and legacy endpoints remain available
    # so this policy can be re-enabled later without a schema migration.
    enforce_active_session = False

    @staticmethod
    def _issuer():
        if not settings.COGNITO_REGION or not settings.COGNITO_USER_POOL_ID:
            raise AuthenticationFailed("Cognito is not configured on the server.")
        return (
            f"https://cognito-idp.{settings.COGNITO_REGION.strip()}.amazonaws.com/"
            f"{settings.COGNITO_USER_POOL_ID.strip()}"
        )

    @classmethod
    def _get_jwks_client(cls):
        issuer = cls._issuer()
        if issuer not in cls._jwks_clients:
            cls._jwks_clients[issuer] = jwt.PyJWKClient(
                f"{issuer}/.well-known/jwks.json"
            )
        return cls._jwks_clients[issuer]

    @classmethod
    def _reset_jwks_client(cls):
        cls._jwks_clients.pop(cls._issuer(), None)

    def authenticate(self, request):
        authorization = request.headers.get("Authorization", "")
        scheme, _, token = authorization.partition(" ")
        token = token.strip()
        if scheme.lower() != "bearer" or not token:
            return None

        if not settings.COGNITO_CLIENT_ID:
            raise AuthenticationFailed("Cognito client ID is not configured on the server.")

        issuer = self._issuer()

        try:
            try:
                signing_key = self._get_jwks_client().get_signing_key_from_jwt(token)
            except jwt.PyJWKClientError:
                # Retry once with a new JWKS client. This handles a Cognito
                # signing-key rotation without requiring a Django restart.
                self._reset_jwks_client()
                signing_key = self._get_jwks_client().get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                issuer=issuer,
                leeway=settings.COGNITO_JWT_LEEWAY_SECONDS,
                options={"verify_aud": False},
            )
        except jwt.ExpiredSignatureError as exc:
            logger.warning("Cognito access token expired")
            raise AuthenticationFailed("Cognito access token expired.") from exc
        except jwt.InvalidIssuerError as exc:
            logger.warning("Cognito access token issuer mismatch")
            raise AuthenticationFailed("Cognito access token issuer mismatch.") from exc
        except jwt.InvalidSignatureError as exc:
            logger.warning("Cognito access token signature mismatch")
            raise AuthenticationFailed("Cognito access token signature mismatch.") from exc
        except (jwt.PyJWTError, ValueError) as exc:
            logger.warning(
                "Cognito token verification failed: %s: %s",
                type(exc).__name__,
                str(exc),
            )
            detail = "Invalid Cognito access token."
            if settings.DEBUG:
                detail = f"{detail} ({type(exc).__name__}: {exc})"
            raise AuthenticationFailed(detail) from exc

        if claims.get("token_use") != "access":
            raise AuthenticationFailed("An access token is required.")
        if claims.get("client_id") != settings.COGNITO_CLIENT_ID:
            raise AuthenticationFailed("The token was issued for another app client.")

        user_id = str(claims.get("sub", "")).strip()
        if not user_id:
            raise AuthenticationFailed("Cognito token has no user ID.")

        principal = CognitoPrincipal(
            user_id=user_id,
            username=str(claims.get("username") or claims.get("cognito:username") or ""),
            email=str(claims.get("email", "")),
        )

        if self.enforce_active_session:
            supplied_session_id = request.headers.get("X-Session-ID", "").strip()
            profile = LearnerProfile.objects.filter(cognito_sub=user_id).only(
                "active_session_id"
            ).first()
            if not supplied_session_id:
                raise AuthenticationFailed("ACTIVE_SESSION_REQUIRED")
            if profile is None or profile.active_session_id != supplied_session_id:
                raise AuthenticationFailed("ACTIVE_SESSION_REPLACED")

        return principal, claims


class CognitoJWTAuthenticationWithoutSession(CognitoJWTAuthentication):
    """JWT verification for the endpoint that creates the active session."""

    enforce_active_session = False
