# Assign to Claude

This is an extension for [Aha! Develop](https://www.aha.io/develop) which provides a way to send the details of Features and Requirements Github as an issue and mention @claude.

You need to have @claude configured within your Github repository per the instructions here; https://code.claude.com/docs/en/github-actions

<img width="754" height="67" alt="image" src="https://github.com/user-attachments/assets/925b176f-af6e-4aa4-b1ca-6600be115cd2" />

<img width="754" height="45" alt="image" src="https://github.com/user-attachments/assets/71cd0f22-4fd8-4fe0-af75-613f8650b2d9" />

## Demo

[demo.mp4](https://github.com/user-attachments/assets/01ed113a-e199-4d5e-8dbc-e2c9de317aba)

## Installing the extension

**Note: In order to install an extension into your Aha! Develop account, you must be an account administrator.**

Install the extension by clicking [here](https://secure.aha.io/settings/account/extensions/install?url=https%3A%2F%2Fsecure.aha.io%2Fextensions%2Faha-develop.assign-claude.gz).

## Working on the extension

Install [`aha-cli`](https://github.com/aha-app/aha-cli):

```sh
npm install -g aha-cli
```

Clone the repo:

TODO: Add the repository URL here

```sh
git clone ...
```

**Note: In order to install an extension into your Aha! Develop account, you must be an account administrator.**

Install the extension into Aha! and set up a watcher:

```sh
aha extension:install
aha extension:watch
```

Now, any change you make inside your working copy will automatically take effect in your Aha! account.

## Building

When you have finished working on your extension, package it into a `.gz` file so that others can install it:

```sh
aha extension:build
```

After building, you can upload the `.gz` file to a publicly accessible URL, such as a GitHub release, so that others can install it using that URL.

To learn more about developing Aha! Develop extensions, including the API reference, the full documentation is located here: [Aha! Develop Extension API](https://www.aha.io/support/develop/extensions)
