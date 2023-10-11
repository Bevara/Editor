# Bevara Access
By installing and using you confirm that you agree to the [Terms of Service](https://bevara.com/terms_of_service/).

An easy-to-use tool based on Bevara open-source libraries to create a decoding and presentation pipeline. Use the auto-suggested pipeline elements or tailor the elements to your needs. Drop the generated HTML into your website for easy display and playback of many types of file formats.

[Source code](https://github.com/Bevara/Editor) &emsp; &emsp; &emsp; &emsp; &emsp; &emsp; &emsp; &emsp; &emsp; &emsp; [Help](https://bevara.com/documentation/)

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