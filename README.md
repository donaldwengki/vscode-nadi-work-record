# Nadi VSCode Extension

## Description
Record and present daily recorded file changes.

## Main Features
- Records daily changes of files in the working project directory.
- Create a directory or file recursively inside the working project directory.
- Diff of two files with ease.


## How to use the extension
1. Open recorded history from Nadi icon in the sidebar.
2. Open the Command Palette via the shortcut specific to your OS:

- on OSX: Press `⌃⌥N` (aka `CONTROL+OPTION+N`) to create file or press `⌃⌥F` (aka `CONTROL+OPTION+F`) to create folder recursively
- on Windows: Press `Ctrl+Alt+N` to create file or press `Ctrl+Alt+F` to create folder recursively

3. Right-click on a file or folder in explorer and select "NADI History: Ignore File/Folder" to select a file or folder to ignore from the historical recording.

4. Diff of two files:
- Right-click the file in explorer, and select "NADI: Add file to compare" to define your first file to be compared.
- Right-click the file in explorer, and select "NADI: Do compare" to determine your second file as well as process the comparison.




Command | Description
--- | ---
```NADI: Create File``` | Create file recursively inside working directory.
```NADI: Create Folder``` | Create folder recursively inside working directory.

## Output samples

### View Recorded File Changes.
![History Files Recorded](media/hist-preview.gif)

### Create File/Folder Recursively.
![Create File/Folder Recursively](media/create-file.gif)

### 1.0.7
Add the ".git" folder to be ignored automatically by the history recorder.

### 1.0.8
Delete history item.

### 1.1.2
Diff of two files added.

## License
[MIT License](LICENSE)