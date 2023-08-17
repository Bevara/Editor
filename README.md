# Bevara access

This is yet a small extension to help debugging decoders from Bevara products.

[Source code](https://github.com/Bevara/Editor) [Help](https://bevara.com/documentation/) [Terms of services](https://bevara.com/terms_of_service/)

## Use the extension from source code

Check out the code :
```bash
git clone https://github.com/Bevara/Editor.git
```

Install dependencies for both the extension and webview UI source code :
```bash
npm run install:all
```

Build webview UI source code :
```bash
npm run build:webview
```

Once the sample is open inside VS Code you can run the extension by doing the following:

1. Press `F5` to open a new Extension Development Host window
2. Inside the host window, open a media file


## Package the extension from source code

```bash
vsce package
vsce publish
```