!macro customInstall
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.md\shell\PrintDownConvertPdf" "" "Convert to PDF (Markdown)"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.md\shell\PrintDownConvertPdf" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}.exe,0"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.md\shell\PrintDownConvertPdf" "MultiSelectModel" "Player"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.md\shell\PrintDownConvertPdf\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}.exe" --convert-to-pdf %*'
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.markdown\shell\PrintDownConvertPdf" "" "Convert to PDF (Markdown)"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.markdown\shell\PrintDownConvertPdf" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}.exe,0"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.markdown\shell\PrintDownConvertPdf" "MultiSelectModel" "Player"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.markdown\shell\PrintDownConvertPdf\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}.exe" --convert-to-pdf %*'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.md\shell\PrintDownConvertPdf"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.markdown\shell\PrintDownConvertPdf"
!macroend
