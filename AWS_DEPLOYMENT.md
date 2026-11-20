# HTS LMS on AWS: low-cost production setup

This deploys the React/TanStack frontend as static files in a **private S3 bucket behind CloudFront**. Only the Django API runs on EC2. Django connects to **RDS PostgreSQL directly over port 5432**; this project does not use the RDS Data API. Course media and uploads use a second private S3 bucket. Cognito handles sign-in, and the EC2 instance role retrieves a single JSON secret from Secrets Manager.

The example Region is **ap-south-1 (Mumbai)**. Replace `example.com`, bucket names, account ID, and IDs throughout. A domain you control is needed for `https://api.example.com` and `https://learn.example.com`. Use the same AWS Region for EC2, RDS, Cognito, media S3, and Secrets Manager. CloudFront's ACM certificate is the exception: create it in **us-east-1**.

If this is a new AWS account, enable MFA on the root user, create a separate administrator identity for setup, and do not create root access keys. Register a domain (or use one you already own). If using Route 53, create a public hosted zone for the domain and point the registrar's nameservers to the four nameservers AWS provides. Domain registration is an extra yearly charge.

## Before creating resources: set a cost limit

1. In AWS Billing, create an **AWS Budget** for **USD 50/month** with actual-spend email alerts at **70%, 90%, and 100%**. Also enable the account's billing alerts and inspect Cost Explorer weekly. A budget alerts you; it does **not** turn resources off.
2. Open the [AWS Pricing Calculator](https://calculator.aws/) and enter this architecture for your Region and expected video traffic. AWS prices, taxes, exchange rates, storage, transfer, and CPU credits can change. There is **no honest guarantee** that a live site will stay under USD 50.
3. Use one `t4g.small` EC2 instance, one **Single-AZ** `db.t4g.micro` RDS PostgreSQL instance, 20 GiB RDS gp3 storage, 20 GiB EC2 gp3 storage, one public IPv4, one secret, and small private S3 buckets. Do **not** select Aurora, Serverless, Multi-AZ, RDS Proxy, NAT Gateway, Load Balancer, paid WAF plan, provisioned IOPS, or RDS Extended Support.
4. Course videos are the largest variable. Keep track of media-bucket GB and outbound GB. This budget assumes a small audience and modest video use. The translation feature uses NLLB/Gemma and a separate worker/model server; it is disabled in this low-cost setup.

### Planning estimate (730-hour month, before tax)

| Item | Approximate USD/month | Assumption |
| --- | ---: | --- |
| RDS PostgreSQL `db.t4g.micro` | 15.33 | Mumbai Single-AZ at about $0.021/hour |
| RDS gp3 storage | 2.62 | 20 GiB at about $0.131/GiB-month |
| EC2 `t4g.small` | 8–17 | Check live Mumbai On-Demand rate in calculator |
| EC2 gp3 EBS | 2–3 | 20 GiB, no extra IOPS |
| One public IPv4 | 3.65 | $0.005/hour |
| One Secrets Manager secret | 0.40 plus requests | One JSON secret |
| Frontend S3, media S3, CloudFront, DNS, logs | 1–5+ | Small files/traffic, eligible free allowances |
| **Expected low-traffic baseline** | **about 33–47+** | Domain registration, tax, SMS, extra transfer/storage/backup/credits excluded |

The RDS figure comes from the [AWS public RDS price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/ap-south-1/index.json). Recheck the calculator before creating the database. RDS bills instance time and provisioned storage even with almost no queries. An “RDS API” switch is not needed here and is not what this application calls. A previous $200 bill likely involved a larger instance, Multi-AZ, Aurora, storage, backup, or another resource; review that old bill's line items before recreating anything. You can use [CloudFront's Free plan](https://aws.amazon.com/cloudfront/pricing/) if your account/distribution is eligible, but check its current allowance and limitations in the console.

## 1. Create the network

Use VPC console → **Create VPC** → “VPC and more”:

- Name `hts-prod`; IPv4 CIDR `10.20.0.0/16`; 2 Availability Zones.
- 1 public subnet (EC2), **2 private subnets in different AZs** (RDS DB subnet group).
- NAT gateways **None**; VPC endpoints **None** initially. Ensure the public subnet's route table points `0.0.0.0/0` to an Internet Gateway and that VPC DNS hostnames/resolution are enabled.
- EC2 security group `hts-api-sg`: inbound TCP 80 and 443 from the internet; TCP 22 only from your current public IP if using SSH. Outbound default.
- RDS security group `hts-db-sg`: inbound TCP 5432 **only from `hts-api-sg`**, never from `0.0.0.0/0`. Outbound default.
- RDS → Subnet groups → create `hts-db-subnets` in this VPC, selecting the **two private subnets**.

RDS requires a DB subnet group spanning two AZs even if the database itself is Single-AZ. No NAT means no NAT hourly charge; the public EC2 instance reaches AWS public endpoints through the Internet Gateway.

## 2. Create the database

RDS → Databases → Create database:

- Standard create → **PostgreSQL** → a currently supported **standard-support major version**. Avoid any “Extended Support” selection.
- Template **Dev/Test** if it allows the exact settings below (the label does not determine your data's importance).
- DB instance identifier `hts-prod-db`; instance class **Burstable `db.t4g.micro`**. If unavailable, recalculate cost before choosing another class.
- Single-AZ, **20 GiB gp3**, default gp3 IOPS/throughput, storage autoscaling **off initially** (monitor free storage and enlarge manually before it fills).
- Create database `hts`, master username `hts_app`, and a strong generated password. Store that password in the one application secret in step 5. If you choose RDS-managed master credentials instead, that creates an additional billed secret; then adapt the app secret accordingly.
- Select `hts-prod` VPC, `hts-db-subnets`, **Public access: No**, `hts-db-sg`, port 5432.
- Backup retention **1 day** to start; enable automated backup. A Single-AZ database has downtime on host/AZ failure. Take a manual snapshot before major migrations and monitor snapshot storage cost.
- Disable Enhanced Monitoring, Performance Insights paid retention, and extra log exports unless you have a specific need.

Copy the RDS **endpoint hostname** (not the full `postgres://` URL). Do not open 5432 publicly. Django's `POSTGRES_SSLMODE=require` encrypts the connection.

If migrating an existing PostgreSQL database, take a verified dump first and restore it to RDS before switching traffic. On a machine that can reach both databases, use PostgreSQL `pg_dump -Fc` and `pg_restore --no-owner`. For an existing private RDS, run those commands from EC2. Run Django migrations on an empty new database before restoring Django application data; coordinate the exact order with the schema version of your dump.

If the source is this project's local `server/db.sqlite3`, first back up that file. With local mode enabled, export the app's models using `python manage.py dumpdata api --natural-foreign --natural-primary -o hts-api-data.json`. After `migrate` on the new PostgreSQL database, transfer the fixture privately to EC2 and run `python manage.py loaddata hts-api-data.json` with the production environment sourced. Verify row counts and learner progress before cutting over. The fixture can contain personal data; never commit it to GitHub. Existing Cognito-linked records only follow users if you keep the same Cognito user pool/`sub` IDs.

## 3. Create private S3 buckets

Create globally unique buckets in Mumbai, for example `hts-prod-web-ACCOUNTID` and `hts-prod-media-ACCOUNTID`.

- Keep **Block all public access ON** for both. Leave **static website hosting OFF**. Enable default SSE-S3 encryption (avoid a customer-managed KMS key and its monthly cost for this plan).
- Enable bucket versioning on media only if you need rollback and can monitor old-version storage; otherwise leave it off initially. Define lifecycle rules for incomplete multipart uploads and old versions if you enable them.
- For the media bucket CORS, configure this JSON (replace the domain):

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedOrigins": ["https://learn.example.com"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

The backend signs private S3 read/upload URLs. The browser does **not** need an Identity Pool, AWS access key, or `VITE_S3_*` values.

If you have existing media, copy its object keys into the new media bucket **without changing paths** (for example `chapter1/en/video/...`). Use `aws s3 sync s3://OLD-BUCKET/ s3://NEW-BUCKET/` from an appropriately authorized workstation, then check object counts/sizes. This step is separate from copying the frontend.

## 4. Create Cognito

Cognito → User pools → Create:

- Choose **Lite** for basic username/password login. Create a user pool in Mumbai.
- Choose username sign-in with **email alias** enabled, because this app signs up with a candidate number as `username` and also allows email sign-in. This choice cannot be changed after pool creation.
- Verify **email**; do not enable SMS verification/MFA for this cost target. Make `email` required and `name`, `phone_number`, `gender` writable/readable in the app client, since sign-up sends them. A required phone number requires valid E.164 input; use an email-only recovery route to avoid SMS costs.
- Create a **public SPA app client with no client secret**. Enable the username/password authentication flow supported by Amplify Auth. The app uses its own login form, so hosted UI/Google federation is not required.
- The current production login page shows Google as disabled; this deployment supports email/candidate-number and password. Enabling Google later requires a separate Cognito social-provider configuration and frontend flow.
- Create groups named `instructors` and `admins`; assign trusted accounts manually. Other users are learners.
- Record the user pool ID and app client ID. Do not put an app client secret in the frontend.

If you already have Cognito users, keep the same user pool or plan an explicit migration. Moving to a new pool changes user `sub` values and can break progress records tied to those IDs.

## 5. Create the application secret and EC2 role

Secrets Manager → Store new secret → **Other type of secret** → Plaintext/JSON → `hts/prod/backend` in Mumbai. Use the keys in [secret.example.json](deploy/aws/secret.example.json). Generate a long random `DJANGO_SECRET_KEY`, then enter the RDS database name, username, and password. Choose the default AWS-managed encryption key and **no automatic rotation** initially; rotate deliberately with a database password change and service restart. Never commit the populated JSON to GitHub.

IAM → Roles → Create role for **EC2** named `hts-api-role`. Attach a custom least-privilege policy, replacing account/Region/bucket/secret IDs:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "MediaList",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::hts-prod-media-ACCOUNTID"
    },
    {
      "Sid": "MediaObjects",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::hts-prod-media-ACCOUNTID/*"
    },
    {
      "Sid": "ApplicationSecret",
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:ap-south-1:ACCOUNTID:secret:hts/prod/backend-*"
    }
  ]
}
```

If you use Session Manager, also attach `AmazonSSMManagedInstanceCore`. No IAM user access keys are needed on EC2. Give the deployer/workstation separate limited permission to upload to the **web bucket** and create CloudFront invalidations; do not give the running EC2 role access to the web bucket.

## 6. Launch the API EC2 instance

EC2 → Launch:

- Ubuntu Server **24.04 ARM64** AMI; **`t4g.small`** (2 GiB RAM). Select `hts-prod`, public subnet, `hts-api-sg`, and IAM instance profile `hts-api-role`.
- Create/select an EC2 key pair if using SSH, keep the downloaded private key secure, and restrict port 22 to your IP. Alternatively use Session Manager with the IAM policy above.
- 20 GiB **gp3** root EBS volume, default performance, no extra volumes.
- Allocate **one Elastic IP** and associate it with this instance. Both attached and idle public IPv4 addresses are billed; release unused addresses.
- Add a Route 53 `A` record `api.example.com` pointing to that Elastic IP. If your domain is elsewhere, add the `A` record there.

SSH to the instance as `ubuntu` with that key and the Elastic IP, or use Session Manager. Then on Ubuntu:

```bash
sudo apt update
sudo apt install -y git python3 python3-venv python3-pip
sudo useradd --system --create-home --shell /usr/sbin/nologin hts
sudo mkdir -p /opt/hts /etc/hts
sudo chown hts:hts /opt/hts
sudo chown root:hts /etc/hts
sudo chmod 750 /etc/hts
sudo -u hts git clone https://github.com/YOUR-OWNER/YOUR-REPO.git /opt/hts/online-hts
sudo python3 -m venv /opt/hts/venv
sudo /opt/hts/venv/bin/pip install --upgrade pip
sudo /opt/hts/venv/bin/pip install -r /opt/hts/online-hts/server/requirements.txt
```

For a private GitHub repository, use a short-lived GitHub deploy token or deploy key rather than putting a personal token in the clone URL or a shell history entry. On an ARM instance, build/install Python dependencies there; do not copy a Windows virtual environment.

Copy [backend.env.example](deploy/aws/backend.env.example) to `/etc/hts/backend.env`, edit its non-secret IDs/hostnames, then restrict access:

```bash
sudo cp /opt/hts/online-hts/deploy/aws/backend.env.example /etc/hts/backend.env
sudo nano /etc/hts/backend.env
sudo chown root:hts /etc/hts/backend.env
sudo chmod 640 /etc/hts/backend.env
```

Run the management commands with the environment file loaded:

```bash
sudo bash -c 'set -a; source /etc/hts/backend.env; set +a; cd /opt/hts/online-hts/server; /opt/hts/venv/bin/python manage.py check --deploy; /opt/hts/venv/bin/python manage.py migrate; /opt/hts/venv/bin/python manage.py collectstatic --noinput'
```

The database must be reachable and the secret/role permissions correct before these commands succeed. If using Django admin, create its superuser with the same sourced environment; this Django admin account is separate from Cognito. Do not run `createsuperuser` unless you need the admin.

## 7. Serve Django through HTTPS on the same EC2

Install [Caddy's official Ubuntu package](https://caddyserver.com/docs/install):

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
sudo apt update
sudo apt install -y caddy
```

Copy [Caddyfile.example](deploy/aws/Caddyfile.example) to `/etc/caddy/Caddyfile`; change the hostname. Copy [hts-api.service](deploy/aws/hts-api.service) to `/etc/systemd/system/hts-api.service`. Then:

```bash
sudo cp /opt/hts/online-hts/deploy/aws/Caddyfile.example /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile
sudo cp /opt/hts/online-hts/deploy/aws/hts-api.service /etc/systemd/system/hts-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now hts-api
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status hts-api --no-pager
curl -I https://api.example.com/
```

Wait for the `api.example.com` DNS record to resolve before Caddy requests its certificate. Caddy owns ports 80/443; Gunicorn listens only on `127.0.0.1:8000`. Review `sudo journalctl -u hts-api -n 100 --no-pager` if startup fails. `DJANGO_ALLOWED_HOSTS` must contain the API hostname, `CORS_ALLOWED_ORIGINS` the frontend HTTPS origin, and `CSRF_TRUSTED_ORIGINS` the API origin. Django trusts the HTTPS forwarding header from this local Caddy proxy.

## 8. Create CloudFront for the frontend

1. Request a public ACM certificate for `learn.example.com` in **us-east-1 (N. Virginia)**. Validate it by DNS.
2. CloudFront → Create distribution. Choose the **private web S3 bucket's regular S3 origin**, not its website endpoint. Enable **Origin Access Control (OAC)** with signing; apply CloudFront's suggested bucket policy granting this distribution `s3:GetObject`. Keep S3 Block Public Access ON.
3. Default root object: `index.html`. Viewer protocol policy: **Redirect HTTP to HTTPS**. Alternate domain: `learn.example.com`. Attach the ACM certificate. Use the Free plan if eligible and it meets your requirements, otherwise pay-as-you-go with usage monitoring.
4. For client-side routes such as `/login` and `/courses/...`, add **Custom error responses**: 403 → `/index.html` → 200 and 404 → `/index.html` → 200, error caching TTL 0. This is for the frontend distribution only; keep media in its separate private bucket.
5. Route 53 → alias `A` record `learn.example.com` to the CloudFront distribution (or a CNAME at another DNS provider).

CloudFront and ACM are global-facing; the frontend still lives entirely in S3. You do **not** need Node or a second EC2 instance for the frontend.

## 9. Build and upload the frontend

On your Windows development machine, pull the GitHub version containing these changes. Install a compatible Node.js version and AWS CLI v2; configure an AWS profile with permission to upload to the web bucket and invalidate this distribution.

From PowerShell:

```powershell
cd C:\path\to\online-hts\client
Copy-Item aws-build.env.example .env.production
notepad .env.production
npm ci
npm run build:aws
$webBucket = "hts-prod-web-ACCOUNTID"
$distributionId = "E123456789ABC"
aws s3 sync .output/public/assets "s3://$webBucket/assets" --delete --cache-control "public,max-age=31536000,immutable"
aws s3 sync .output/public "s3://$webBucket" --delete --exclude "assets/*" --exclude "index.html" --exclude "_shell.html" --cache-control "public,max-age=300"
aws s3 cp .output/public/index.html "s3://$webBucket/index.html" --cache-control "no-cache,no-store,must-revalidate" --content-type "text/html"
aws cloudfront create-invalidation --distribution-id $distributionId --paths "/*"
```

The build script copies TanStack's `_shell.html` to `index.html`. Upload **only** `client/.output/public`; do not upload `client/.output/server`, `client/.env.production`, source files, or the backend to the web bucket. Vite `VITE_*` settings are public in the browser bundle; never put passwords, AWS keys, or Secrets Manager values there.

## 10. Check the deployed app

1. Open `https://learn.example.com/login` directly in a new tab and refresh it; the SPA route should still load.
2. Sign up, confirm by email, sign in, and open the dashboard. Check the browser Network tab for API calls to `https://api.example.com` with successful CORS responses.
3. Open a course chapter and confirm media comes from short-lived, signed URLs for the **private media bucket**. Test an instructor upload and learner progress. `POSTGRES_HOST` should point at RDS, and the RDS console should show the DB is **not public**.
4. Check RDS → Monitoring for CPU, free storage, connections, and burst balance; EC2 → Monitoring for CPU; Billing → Cost Explorer for daily spend. Review budget emails.
5. Test recovery: verify an automated RDS snapshot exists and document how to restore it. Back up any uploaded media separately if it is irreplaceable.

## Updates and known limits

- Backend update on EC2: `sudo -u hts git -C /opt/hts/online-hts pull --ff-only`, install updated requirements, run `migrate` and `collectstatic` with the environment sourced, then `sudo systemctl restart hts-api`. Take an RDS snapshot before schema changes. Frontend update: repeat step 9.
- Production mode fails startup if its secret, PostgreSQL, Cognito, S3, or host settings are missing, avoiding accidental SQLite use. Local development remains available with `HTS_LOCAL_DEV=true`.
- The current PowerPoint translation code expects Redis/Celery plus large NLLB or a local Gemma/LM Studio service. That does **not** fit this tiny EC2 plan, so `HTS_ENABLE_PPT_TRANSLATION=false` returns a clear 503 for translation requests. Enable it only after designing and pricing a separate worker/model setup.
- The AI assistant is currently marked “Coming soon.” Its dormant TanStack server function cannot run from S3; if you later activate that button, move the function behind a Django API endpoint first.
- This is a cost-focused **Single-AZ** architecture with one API server. It has downtime during instance, AZ, or deployment failures. Higher availability costs more.
- Direct signed S3 video URLs can generate transfer charges. If media traffic grows, evaluate a **separate private-media CloudFront distribution** with OAC and signed URLs; the backend already has optional `AWS_CLOUDFRONT_*` signing settings, but this guide leaves them unset to keep setup small.

### Source references

- [RDS PostgreSQL pricing](https://aws.amazon.com/rds/postgresql/pricing/) · [RDS storage classes/minimum](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Storage.html) · [RDS VPC/subnet groups](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_VPC.WorkingWithRDSInstanceinaVPC.html)
- [EC2 On-Demand pricing](https://aws.amazon.com/ec2/pricing/on-demand/) · [Public IPv4 pricing](https://aws.amazon.com/vpc/pricing/) · [EBS pricing](https://aws.amazon.com/ebs/pricing/)
- [CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/) · [S3 origin OAC](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html) · [CloudFront ACM certificate Region](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html)
- [Cognito pricing](https://aws.amazon.com/cognito/pricing/) · [Cognito username/email aliases](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-attributes.html) · [Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/)
