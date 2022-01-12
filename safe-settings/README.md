# safe-settings

> A GitHub App built with [Probot](https://github.com/probot/probot) that A Probot app

## Setup

```sh
# Install dependencies
npm install

# Run the bot
npm start
```

## Docker

```sh
# 1. Build container
docker build -t safe-settings .

# 2. Start container
docker run -e APP_ID=<app-id> -e PRIVATE_KEY=<pem-value> safe-settings
```

## Contributing

If you have suggestions for how safe-settings could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2022 Alexander Darr <alexdarr@gmail.com>
