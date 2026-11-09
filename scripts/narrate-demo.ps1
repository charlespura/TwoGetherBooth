$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$demoRoot = Split-Path -Parent $PSScriptRoot
$demoAudioDirectory = Join-Path $demoRoot '.demo-work/narration'
New-Item -ItemType Directory -Path $demoAudioDirectory -Force | Out-Null
$demoStoryboard = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'demo-storyboard.json') -Raw | ConvertFrom-Json
$demoSynthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $demoSynthesizer.SelectVoice('Microsoft Zira Desktop')
    $demoSynthesizer.Rate = 0
    $demoSynthesizer.Volume = 100
    for ($demoIndex = 0; $demoIndex -lt $demoStoryboard.Count; $demoIndex++) {
        $demoAudioPath = Join-Path $demoAudioDirectory "voice-$demoIndex.wav"
        $demoSynthesizer.SetOutputToWaveFile($demoAudioPath)
        $demoSynthesizer.Speak($demoStoryboard[$demoIndex].text)
        $demoSynthesizer.SetOutputToNull()
        Write-Output "Narrated chapter $($demoIndex + 1)"
    }
} finally {
    $demoSynthesizer.Dispose()
}
