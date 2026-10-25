$ErrorActionPreference = 'Stop'
$hwp = $null
try {
    $hwp = New-Object -ComObject HWPFrame.HwpObject
    $hwp.XHwpWindows.Item(0).Visible = $false
    Write-Output 'Hancom instance created'
    $result = $hwp.Open('C:\Programings\2026_2_창의학기제\output\reports\2026-2학기__010_최정흠_주간학습보고서_6주차_작성본.hwp', 'HWP', 'forceopen:true')
    Write-Output "Open result: $result"
    if (-not $result) { throw 'HWP open failed' }
    Write-Output "Pages: $($hwp.PageCount)"
    $saved = $hwp.SaveAs('C:\Programings\2026_2_창의학기제\tmp\reports\week6\preview.pdf', 'PDF', '')
    Write-Output "PDF export: $saved"
} finally {
    if ($null -ne $hwp) {
        $hwp.Quit()
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($hwp)
    }
}
