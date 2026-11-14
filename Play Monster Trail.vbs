Option Explicit

' Open the combined campaign as a borderless fullscreen game window, using the
' normal browser profile. Keeping the same file URL and profile preserves
' existing browser saves (they live in that profile's localStorage).
'
' To leave fullscreen: press F in game (toggles fullscreen), or F11.
' To quit: Alt+F4.
' Note: Chrome/Edge may ignore --start-fullscreen when the browser is
' already running; the window then opens normally and the game enters
' fullscreen on the first key or click.
Dim files, shell, folder, gamePath, gameUrl, browser, preferred, command
Set files = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
folder = files.GetParentFolderName(WScript.ScriptFullName)
gamePath = files.BuildPath(folder, "claude's monsters.html")

If Not files.FileExists(gamePath) Then
  MsgBox "MONSTER TRAIL could not be found. Keep this launcher in the game folder.", vbExclamation, "MONSTER TRAIL"
  WScript.Quit 1
End If

preferred = ""
On Error Resume Next
preferred = shell.RegRead("HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice\ProgId")
Err.Clear
On Error GoTo 0

If InStr(1, preferred, "Edge", vbTextCompare) > 0 Then
  browser = FindBrowser("msedge.exe")
  If browser = "" Then browser = FindBrowser("chrome.exe")
Else
  browser = FindBrowser("chrome.exe")
  If browser = "" Then browser = FindBrowser("msedge.exe")
End If

If browser = "" Then
  MsgBox "Chrome or Microsoft Edge is required to open the game window.", vbExclamation, "MONSTER TRAIL"
  WScript.Quit 1
End If

gameUrl = "file:///" & Replace(Replace(Replace(gamePath, "%", "%25"), "\", "/"), " ", "%20")
command = Chr(34) & browser & Chr(34) & " --app=" & Chr(34) & gameUrl & Chr(34) & " --start-fullscreen"
On Error Resume Next
shell.Run command, 1, False
If Err.Number <> 0 Then
  MsgBox "The game window could not open: " & Err.Description, vbExclamation, "MONSTER TRAIL"
  WScript.Quit 1
End If
On Error GoTo 0

Function FindBrowser(executable)
  Dim candidate, root
  FindBrowser = ""
  For Each root In Array("HKCU", "HKLM")
    candidate = ""
    On Error Resume Next
    candidate = shell.RegRead(root & "\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\" & executable & "\")
    Err.Clear
    On Error GoTo 0
    If candidate <> "" Then
      If files.FileExists(candidate) Then
        FindBrowser = candidate
        Exit Function
      End If
    End If
  Next
End Function
