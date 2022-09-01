# Serverless Framework Deployment of safe-settings on AWS

`safe-settings` receives HTTP POST Webhook payload. This deployment uses [`@probot/adapter-aws-lambda-serverless`](https://github.com/probot/adapter-aws-lambda-serverless) to deploy the GitHub App written in Node.js running on [AWS Lambda](https://aws.amazon.com/lambda/) and using the [Serverless Framework](https://github.com/serverless/serverless).

This App does not include any kind of persistence (database). For more advanced examples, check out the [serverless/examples repository](https://github.com/serverless/examples/) which includes Typescript, Mongo, DynamoDB and other examples.

## Usage

### Pre-Requisites

In order to deploy the app from you local environment, follow the [Serverless user guide for AWS](https://www.serverless.com/framework/docs/providers/aws/guide/quick-start/).

If you use this example as a template, make sure to update [`serverless.yml`](https://github.com/probot/example-aws-lambda-serverless/blob/main/serverless.yml) and set new values for

- `service`
- `app`
- `org`

Make sure to create the following parameters on [https://app.serverless.com](https://app.serverless.com/):

- `APP_ID`
- `PRIVATE_KEY`
- `WEBHOOK_SECRET`

`NOTE`:
Make sure you increase the timeout for the Lambda function to the MAX (15 Mins). Follow the instructions [here](https://bobbyhadz.com/blog/aws-lambda-task-timed-out-after-seconds)

### CD

For continuous deployment via GitHub action, copy [probot/example-aws-lambda-serverless repository's deploy workflow](https://github.com/probot/example-aws-lambda-serverless/blob/main/.github/workflows/deploy.yml) and create the following secrets:

1. `SERVERLESS_ACCESS_KEY` - You can create a Serverless access key at `https://app.serverless.com/<your org>/settings/accessKeys`
2. `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` - you will likely find your AWS credentials in `~/.aws/credentials`

### Debug via unit tests

1. Intall nyc and mocha: `npm install -g nyc mocha`
2. From the VSCode `RUN AND DEBUG` menu select `Mocha` and click the green arrow to start debugging.

### Debug by launching probot locally and sending it a payload

1. Point your GitHub app to your local using something like smee.io
2. Copy .env-sample to .env and populate with values specific for your GitHub app. For the `PRIVATE_KEY` replace newlines with `\\n` to make the string value a single line.
3. From the VSCode `RUN AND DEBUG` menu select `Launch Probot` and click the green arrow to start debugging.


### Deployment

```
$ serverless package
```


```
$ serverless deploy
```

After deploying, you should see output similar to:

```bash
Deploying safe-settings to stage dev (us-east-1)

✔ Service deployed to stack safe-settings-dev (152s)

dashboard: https://app.serverless.com/yadhav/apps/safe-settings/safe-settings/dev/us-east-1
endpoint: POST - https://xxxxxxx.execute-api.us-east-1.amazonaws.com/api/github/webhooks
functions:
  webhooks: safe-settings-dev-webhooks (9 MB)
```

_Note_: In current form, after deployment, your API is public and can be invoked by anyone. For production deployments, you might want to configure an authorizer. For details on how to do that, refer to [http event docs](https://www.serverless.com/framework/docs/providers/aws/events/apigateway/).

### Invocation

After successful deployment, you can call the created application via HTTP:

```bash
curl -X POST --header @headers.txt --data @data.json https://xxxxxxx.execute-api.us-east-1.amazonaws.com/api/github/webhooks
```

Which should result in response similar to the following (removed `input` content for brevity):

```json
{"ok":true}
```

### Local development

You can invoke your function locally by using the following command:

```bash
serverless invoke local --function hello
```

Which should result in response similar to the following:

```
{
  "statusCode": 200,
  "body": "{\n  \"message\": \"Go Serverless v3.0! Your function executed successfully!\",\n  \"input\": \"\"\n}"
}
```


Alternatively, it is also possible to emulate API Gateway and Lambda locally by using `serverless-offline` plugin. In order to do that, execute the following command:

```bash
serverless plugin install -n serverless-offline
```

It will add the `serverless-offline` plugin to `devDependencies` in `package.json` file as well as will add it to `plugins` in `serverless.yml`.

After installation, you can start local emulation with:

```
serverless offline
```

To learn more about the capabilities of `serverless-offline`, please refer to its [GitHub repository](https://github.com/dherault/serverless-offline).
