$presentationApp = $null
$presentationDeck = $null
try {
    $presentationApp = New-Object -ComObject PowerPoint.Application
    $presentationDeck = $presentationApp.Presentations.Open('C:\Programings\2026_2_창의학기제\output\presentations\WeGoTrip_지출정산_준비물_발표자료.pptx', -1, 0, 0)
    $presentationDeck.SaveAs('C:\Programings\2026_2_창의학기제\tmp\presentation-expense-packing\native-final.pdf', 32)
    Write-Output 'PowerPoint PDF export complete'
} finally {
    if ($null -ne $presentationDeck) {
        $presentationDeck.Close()
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($presentationDeck)
    }
    if ($null -ne $presentationApp) {
        $presentationApp.Quit()
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($presentationApp)
    }
}
