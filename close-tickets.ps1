param(
    [int[]]$IssueNumbers = @(101, 104, 113, 120, 121),
    [string]$Token = $env:GITHUB_TOKEN
)

function Close-Issue {
    param([int]$IssueNumber)
    try {
        $url = "https://api.github.com/repos/samarquis/AntiqueTrail/issues/$IssueNumber"
        $body = "{\"state\":\"closed\"}"
        $result = Invoke-RestMethod -Method PATCH -Uri $url -Headers @{
            'Authorization' = "token $Token"
            'Accept' = 'application/vnd.github+json'
        } -Body $body
        Write-Host "Closed #$IssueNumber: $($result.state)"
    } catch {
        Write-Host "Error closing #$IssueNumber: $_"
    }
}

foreach ($num in $IssueNumbers) {
    Close-Issue -IssueNumber $num
}