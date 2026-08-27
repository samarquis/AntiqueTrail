Add-Type -AssemblyName System.Net.Http
$client = New-Object System.Net.Http.HttpClient
$client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.HttpAuthenticationHeaderValue]::new("Bearer", $env:GITHUB_TOKEN)
$client.DefaultRequestHeaders.Accept.Add("application/vnd.github+json")
$url = "https://api.github.com/repos/samarquis/AntiqueTrail/issues/101"
$req = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Patch, $req)
$req.Content = [System.Net.Http.StringContent]::new("state=closed", [System.Text.Encoding]::UTF8, "application/x-www-form-urlencoded")
$resp = $client.Send($req)
Write-Host "Status: $($resp.StatusCode)"
$resp.Content.ReadAsStringAsync() | Out-String | Write-Host