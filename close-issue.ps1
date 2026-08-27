Add-Type -AssemblyName System.Net.Http
$client = New-Object System.Net.Http.HttpClient
$client.DefaultRequestHeaders.Authorization = "Bearer " + $env:GITHUB_TOKEN
$client.DefaultRequestHeaders.Accept.Add("application/vnd.github+json")
$body = "{\"state\":\"closed\"}"
$url = "https://api.github.com/repos/samarquis/AntiqueTrail/issues/101"
$req = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Patch, $url)
$req.Headers.Authorization = [System.Net.Http.Headers.HttpAuthenticationHeaderValue]::new("Bearer", $env:GITHUB_TOKEN)
$req.Headers.Accept.Add("application/vnd.github+json")
$req.Content = [System.Net.Http.StringContent]::new($body, [System.Text.Encoding]::UTF8, "application/json")
$resp = $client.Send($req)
Write-Host "Status: $($resp.StatusCode)"
$resp.Content.ReadAsStringAsync() | Out-String | Write-Host