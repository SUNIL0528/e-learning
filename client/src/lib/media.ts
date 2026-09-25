import { getUrl } from "aws-amplify/storage";

const identityPoolId = import.meta.env.VITE_COGNITO_IDENTITY_POOL_ID as string | undefined;
const s3Bucket = import.meta.env.VITE_S3_BUCKET as string | undefined;
const s3Region = import.meta.env.VITE_S3_REGION as string | undefined;

export const directS3MediaConfigured = Boolean(identityPoolId && s3Bucket && s3Region);

type CachedUrl = {
  url: string;
  expiresAt: number;
};

const urlCache = new Map<string, CachedUrl>();
const inFlightUrlRequests = new Map<string, Promise<string | null>>();

/**
 * Create a short-lived S3 URL in the browser using Cognito Identity Pool
 * credentials. The URL is cached until shortly before it expires so changing
 * slides does not repeatedly request the same object URL.
 */
export async function getTemporaryMediaUrl(
  path: string,
  validateObjectExistence = false,
  forceRefresh = false,
): Promise<string | null> {
  if (!directS3MediaConfigured) return null;

  if (!forceRefresh) {
    const cached = urlCache.get(path);
    if (cached && cached.expiresAt > Date.now() + 30_000) return cached.url;

    const inFlight = inFlightUrlRequests.get(path);
    if (inFlight) return inFlight;
  } else {
    urlCache.delete(path);
  }

  const request = getUrl({
    path,
    options: {
      expiresIn: 900,
      ...(validateObjectExistence ? { validateObjectExistence: true } : {}),
    },
  })
    .then((result) => {
      const url = result.url.toString();
      urlCache.set(path, {
        url,
        expiresAt: result.expiresAt.getTime(),
      });
      return url;
    })
    .catch((error: unknown) => {
      console.error(`Unable to create temporary S3 URL for ${path}`, error);
      return null;
    })
    .finally(() => {
      if (inFlightUrlRequests.get(path) === request) inFlightUrlRequests.delete(path);
    });

  inFlightUrlRequests.set(path, request);
  return request;
}

export function chapterMediaPath(
  chapterNumber: number,
  language: string,
  mediaType: "videos" | "audios" | "ppt",
  filename: string,
) {
  return `chapter${chapterNumber}/${language}/${mediaType}/${filename}`;
}
