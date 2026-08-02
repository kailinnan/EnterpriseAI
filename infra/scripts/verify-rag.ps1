param([string]$BaseUrl = "http://localhost:3001/api/v1")
$ErrorActionPreference = "Stop"

function Invoke-Api([string]$Method, [string]$Path, $Body = $null, [string]$Bearer = "") {
  $headers = @{}
  if ($Bearer) { $headers.Authorization = "Bearer $Bearer" }
  $params = @{ Method = $Method; Uri = "$BaseUrl/$Path"; Headers = $headers }
  if ($null -ne $Body) {
    $params.ContentType = "application/json"
    $params.Body = ($Body | ConvertTo-Json -Depth 10 -Compress)
  }
  Invoke-RestMethod @params
}

$login = Invoke-Api POST "auth/login" @{ email = "owner@example.com"; password = "DevPassword123!" }
$token = $login.accessToken
$models = Invoke-Api GET "models" $null $token
$embedding = $models | Where-Object { $_.capability_json.capabilities -contains "embedding" } | Select-Object -First 1
$chatModel = $models | Where-Object { $_.capability_json.capabilities -contains "chat" } | Select-Object -First 1
if (-not $embedding -or -not $chatModel) { throw "Mock chat/embedding model was not seeded" }

$kb = $null
$assistant = $null
try {
  Write-Host "[rag] create knowledge base"
  $kb = Invoke-Api POST "knowledge-bases" @{
    name = "RAG verification $([guid]::NewGuid())"
    description = "Automated end-to-end verification"
    embeddingModelConfigId = $embedding.id
    chunkConfig = @{ chunkTokens = 200; overlapTokens = 30; minChunkTokens = 20 }
  } $token

  $fixture = (Resolve-Path "tests/fixtures/enterprise-handbook.md").Path
  Write-Host "[rag] upload fixture"
  $uploadJson = & curl.exe -sS -X POST -H "Authorization: Bearer $token" -F "file=@$fixture;type=text/markdown" "$BaseUrl/knowledge-bases/$($kb.id)/documents"
  if ($LASTEXITCODE -ne 0) { throw "Document upload failed" }
  $upload = $uploadJson | ConvertFrom-Json

  $document = $null
  Write-Host "[rag] wait for indexing"
  for ($i = 0; $i -lt 60; $i++) {
    $documents = @(Invoke-Api GET "knowledge-bases/$($kb.id)/documents" $null $token)
    $document = $documents | Where-Object { $_.id -eq $upload.documentId } | Select-Object -First 1
    if ($document.index_status -eq "ready") { break }
    if ($document.index_status -eq "failed") { throw "Indexing failed: $($document.error_message)" }
    Start-Sleep -Seconds 1
  }
  if ($document.index_status -ne "ready") { throw "Document indexing timed out" }

  $chunks = @(Invoke-Api GET "documents/$($document.id)/chunks" $null $token)
  if ($chunks.Count -lt 1) { throw "No chunks were indexed" }
  Write-Host "[rag] run hybrid retrieval"
  $retrievalResult = Invoke-Api POST "retrieval/debug" @{
    knowledgeBaseIds = @($kb.id)
    query = "What is the annual subscription Token refund policy"
    topK = 8
  } $token
  $retrieval = @($retrievalResult)
  if ($retrieval.Count -lt 1) { throw "Hybrid retrieval returned no results" }

  Write-Host "[rag] create and publish assistant"
  $assistant = Invoke-Api POST "assistants" @{
    name = "RAG verification $([guid]::NewGuid())"
    description = "Automated verification assistant"
    systemPrompt = "You are the enterprise knowledge verification assistant."
    modelConfigId = $chatModel.id
    knowledgeBaseIds = @($kb.id)
    temperature = 0
    maxOutputTokens = 256
    retrievalConfig = @{ topK = 8 }
  } $token
  $null = Invoke-Api POST "assistants/$($assistant.id)/publish" @{} $token
  $assistantTest = Invoke-Api POST "assistants/$($assistant.id)/test" @{ content = "Hello" } $token
  if (-not $assistantTest.text) { throw "Assistant model test returned no text" }

  $conversation = Invoke-Api POST "conversations" @{ assistantId = $assistant.id } $token
  Write-Host "[rag] run SSE chat"
  $payloadPath = Join-Path $env:TEMP "enterprise-ai-hub-chat-$([guid]::NewGuid()).json"
  [System.IO.File]::WriteAllText(
    $payloadPath,
    '{"content":"What is the annual subscription Token refund policy?"}',
    [System.Text.UTF8Encoding]::new($false)
  )
  try {
    $sse = & curl.exe -sS -N -X POST -H "Authorization: Bearer $token" -H "Content-Type: application/json" --data-binary "@$payloadPath" "$BaseUrl/conversations/$($conversation.id)/messages"
  }
  finally {
    Remove-Item -LiteralPath $payloadPath -Force -ErrorAction SilentlyContinue
  }
  if (($sse -join "`n") -notmatch "response.completed") {
    Write-Host ($sse -join "`n")
    throw "SSE chat did not complete"
  }

  [pscustomobject]@{
    status = "ok"
    documentId = $document.id
    chunkCount = $chunks.Count
    retrievalCount = $retrieval.Count
    assistantId = $assistant.id
    sseCompleted = $true
  } | ConvertTo-Json -Depth 5
}
finally {
  if ($assistant) { try { $null = Invoke-Api DELETE "assistants/$($assistant.id)" $null $token } catch {} }
  if ($kb) { try { $null = Invoke-Api DELETE "knowledge-bases/$($kb.id)" $null $token } catch {} }
}
