# Deployment

This is our own documentation for deploying to GCP. In general this should only need to be done once, unless we need to modify any of the core logic. Changes to settings in [`.github`](./.github) will be automatically picked up.

Package Helm chart:

```bash
$ helm package helm/safe-settings
Successfully packaged chart and saved it to: /home/zeyu/OneDrive/Documents/Projects/hacktron/safe-settings/safe-settings-0.1.0.tgz
```

Push image to GCP artifact repository:

```bash
$ gcloud artifacts repositories create safe-settings \
        --repository-format=docker \
        --location=us-central1 \
        --description="GitHub policy-as-code"
Create request issued for: [safe-settings]
Waiting for operation [projects/hacktron-462816/locations/us-central1/operations/b15dad24-1d36-409d-8d81-64f983554982] to complete...done.                                                             
Created repository [safe-settings].

$ docker tag safe-settings us-central1-docker.pkg.dev/hacktron-462816/safe-settings/github-app:0.1.0

$ docker push us-central1-docker.pkg.dev/hacktron-462816/safe-settings/github-app:0.1.0
```

Push Helm chart:

```bash
$ helm push safe-settings-0.1.0.tgz oci://us-central1-docker.pkg.dev/hacktron-462816/safe-settings
Pushed: us-central1-docker.pkg.dev/hacktron-462816/safe-settings/safe-settings:0.1.0
Digest: sha256:818ad22a4f3fec92dbfcf0d244e35024cc25db35a88584742b92a31c00c37656
```

Deploy Helm chart:

```bash
$ gcloud container clusters create --zone us-central1-a safe-settings-cluster
$ gcloud container clusters get-credentials --zone us-central1-a safe-settings-cluster

$ source .env
helm install safe-settings oci://us-central1-docker.pkg.dev/hacktron-462816/safe-settings/safe-settings --version 0.1.0 --set env.ADMIN_REPO="$ADMIN_REPO" --set env.GH_ORG="$GH_ORG" --set env.CRON="$CRON" --set env.APP_ID="\"$APP_ID\"" --set env.PRIVATE_KEY="$PRIVATE_KEY" --set env.WEBHOOK_SECRET="$WEBHOOK_SECRET" --set env.GITHUB_CLIENT_ID="$GITHUB_CLIENT_ID" --set env.GITHUB_CLIENT_SECRET="$GITHUB_CLIENT_SECRET" --set env.WEBHOOK_PROXY_URL="$WEBHOOK_PROXY_URL"

$ helm upgrade --install safe-settings oci://us-central1-docker.pkg.dev/hacktron-462816/safe-settings/safe-settings --set env.ADMIN_REPO="$ADMIN_REPO" --set env.GH_ORG="$GH_ORG" --set env.CRON="$CRON" --set env.APP_ID="$APP_ID" --set env.PRIVATE_KEY="$PRIVATE_KEY" --set env.WEBHOOK_SECRET="$WEBHOOK_SECRET" --set env.GITHUB_CLIENT_ID="$GITHUB_CLIENT_ID" --set env.GITHUB_CLIENT_SECRET="$GITHUB_CLIENT_SECRET" --set env.WEBHOOK_PROXY_URL="$WEBHOOK_PROXY_URL" --force 
```
