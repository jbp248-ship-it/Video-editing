Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "cmd /c taskkill /F /IM electron.exe >nul 2>&1 & for /f ""tokens=5"" %a in ('netstat -ano ^| findstr :3099 ^| findstr LISTENING') do taskkill /F /PID %a >nul 2>&1 & timeout /t 1 /nobreak >nul & npx electron .", 0, False
