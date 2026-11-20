# Run HTS locally without AWS

This mode is for editing and previewing the website. It uses `server/db.sqlite3`
for local data, a temporary preview sign-in instead of Cognito, and module JSON already in
the repository for lesson content. It does not connect to RDS, Cognito, Secrets
Manager, or S3. Your existing `client/.env` and `server/.env` remain unchanged.

## Windows PowerShell

Install Python dependencies and client packages once if needed:

```powershell
python -m pip install -r server/requirements.txt
npm install --prefix client
```

Open two terminals in the repository root. In the first:

```powershell
.\scripts\run-local-backend.ps1
```

In the second:

```powershell
.\scripts\run-local-client.ps1
```

Open **http://127.0.0.1:5173** and enter any email and non-empty password on the
local sign-in or sign-up screen. Both open a local learner preview; no account is
created and the password is not saved. The Google button opens a local demo
learner; it does not contact Google. The backend API is at
**http://127.0.0.1:8000**. Signing out returns to the form. Local learner
progress and other database changes stay in the ignored `server/db.sqlite3`
file and never go to RDS.

The repository contains module scripts and question data, but no local course
videos, audio, or PowerPoint files. Lesson text and progress screens work;
media appears only if the corresponding files are placed under `server/media`
using the existing chapter folder structure. Doubt attachments uploaded in local
mode are saved under `server/media/doubts`. Translation jobs still require
their separate local tools and Redis worker.

`HTS_LOCAL_DEV` works only with Django debug mode. The backend binds to
127.0.0.1 and accepts local preview headers only from the loopback address. Do
not use these scripts to deploy the site.
