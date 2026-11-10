# Serveur de l'application "Suivi des stages" - aucun logiciel a installer (PowerShell de Windows).
# Lancement : double-clic sur Demarrer.bat   (ou : powershell -ExecutionPolicy Bypass -File serveur.ps1 -Port 8080)
param([int]$Port = 8080)
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Pub = Join-Path $Root 'public'
$Data = Join-Path $Root 'donnees'
$Docs = Join-Path $Data 'docs'
$UsersFile = Join-Path $Data 'comptes.json'
$ConfigFile = Join-Path $Data 'config.json'
New-Item -ItemType Directory -Force $Docs | Out-Null
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$Sections = @('profil', 'cv', 'lettre', 'memento', 'demandes', 'journal', 'etat', 'prof')
$Mime = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.ico' = 'image/x-icon'; '.webmanifest' = 'application/manifest+json; charset=utf-8' }

function Read-Text($p) { [IO.File]::ReadAllText($p, $Utf8) }
function Write-Text($p, $t) {
    $dir = Split-Path -Parent $p
    if (-not [IO.Directory]::Exists($dir)) { [void][IO.Directory]::CreateDirectory($dir) }
    $tmp = "$p.tmp"
    [IO.File]::WriteAllText($tmp, $t, $Utf8)
    if ([IO.File]::Exists($p)) { [IO.File]::Delete($p) }
    [IO.File]::Move($tmp, $p)
}
function New-Hex([int]$n) {
    $b = New-Object byte[] $n
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($b); $rng.Dispose()
    -join ($b | ForEach-Object { $_.ToString('x2') })
}
function Get-Hash([string]$pw, [string]$saltHex) {
    $salt = [Text.Encoding]::ASCII.GetBytes($saltHex)
    $k = New-Object System.Security.Cryptography.Rfc2898DeriveBytes($pw, $salt, 20000)
    try { [Convert]::ToBase64String($k.GetBytes(32)) } finally { $k.Dispose() }
}

# ---------- Configuration (code d'inscription des professeurs) ----------
if ([IO.File]::Exists($ConfigFile)) { $Config = ConvertFrom-Json (Read-Text $ConfigFile) }
else {
    $Config = New-Object psobject -Property @{ codeProf = ('PROF-' + (New-Hex 3).ToUpper()) }
    Write-Text $ConfigFile (ConvertTo-Json $Config -Compress)
}

# ---------- Comptes ----------
$Users = New-Object System.Collections.ArrayList
if ([IO.File]::Exists($UsersFile)) {
    $lus = ConvertFrom-Json (Read-Text $UsersFile)
    foreach ($u in $lus) {
        [void]$Users.Add(@{ id = $u.id; role = $u.role; nom = $u.nom; prenom = $u.prenom; identifiant = $u.identifiant; classeId = $u.classeId; sel = $u.sel; hash = $u.hash })
    }
}
function Save-Users {
    $items = foreach ($u in $Users) { ConvertTo-Json $u -Compress }
    Write-Text $UsersFile ('[' + ($items -join ',') + ']')
}
function Find-User($id) { foreach ($u in $Users) { if ($u.id -eq $id) { return $u } }; return $null }
function Get-UserJson($u) {
    ConvertTo-Json @{ id = $u.id; role = $u.role; nom = $u.nom; prenom = $u.prenom; identifiant = $u.identifiant; classeId = $u.classeId } -Compress
}
$Sessions = @{}

# ---------- Documents JSON (stockes tels quels, un fichier par document) ----------
$Cache = @{}
function Get-DocPath($key) { Join-Path $Docs ($key.Replace('/', '\') + '.json') }
function Get-Doc($key) {
    if ($Cache.ContainsKey($key)) { return $Cache[$key] }
    $p = Get-DocPath $key
    $t = 'null'
    if ([IO.File]::Exists($p)) { $t = Read-Text $p; if ([string]::IsNullOrWhiteSpace($t)) { $t = 'null' } }
    $Cache[$key] = $t
    return $t
}
function Set-Doc($key, $text) { Write-Text (Get-DocPath $key) $text; $Cache[$key] = $text }

# ---------- Reponses HTTP ----------
function Send-Bytes($ctx, [int]$code, [byte[]]$bytes, [string]$type) {
    $r = $ctx.Response
    $r.StatusCode = $code
    $r.ContentType = $type
    $r.Headers['Cache-Control'] = 'no-store'
    $r.Headers['X-Content-Type-Options'] = 'nosniff'
    $r.ContentLength64 = $bytes.Length
    if ($ctx.Request.HttpMethod -ne 'HEAD') { $r.OutputStream.Write($bytes, 0, $bytes.Length) }
    $r.Close()
}
function Send-Json($ctx, [int]$code, [string]$json) { Send-Bytes $ctx $code $Utf8.GetBytes($json) 'application/json; charset=utf-8' }
function Send-Err($ctx, [int]$code, [string]$err) { Send-Json $ctx $code ('{"erreur":"' + $err + '"}') }
function Read-Body($req) {
    $sr = New-Object IO.StreamReader($req.InputStream, $Utf8)
    try { $sr.ReadToEnd() } finally { $sr.Dispose() }
}
function Send-File($ctx, $path) {
    if ($path -eq '/') { $path = '/index.html' }
    $rel = [Uri]::UnescapeDataString($path).TrimStart('/').Replace('/', '\')
    $full = [IO.Path]::GetFullPath((Join-Path $Pub $rel))
    if (-not $full.StartsWith($Pub + '\') -or -not [IO.File]::Exists($full)) { Send-Bytes $ctx 404 $Utf8.GetBytes('Introuvable') 'text/plain; charset=utf-8'; return }
    $ext = [IO.Path]::GetExtension($full).ToLower()
    $type = $Mime[$ext]; if (-not $type) { $type = 'application/octet-stream' }
    Send-Bytes $ctx 200 ([IO.File]::ReadAllBytes($full)) $type
}

# ---------- Routes ----------
function Handle($ctx) {
    $req = $ctx.Request
    $path = $req.Url.AbsolutePath
    $m = $req.HttpMethod
    if (-not $path.StartsWith('/api/')) { Send-File $ctx $path; return }
    if ($req.ContentLength64 -gt 3000000) { Send-Err $ctx 413 'trop_gros'; return }

    $user = $null; $tok = $null
    $auth = $req.Headers['Authorization']
    if ($auth -and $auth.StartsWith('Bearer ')) {
        $tok = $auth.Substring(7)
        if ($Sessions.ContainsKey($tok)) { $user = Find-User $Sessions[$tok] }
    }
    $route = "$m $path"

    if ($route -eq 'GET /api/public/classes') { Send-Json $ctx 200 (Get-Doc 'commun/classes'); return }

    if ($route -eq 'POST /api/inscription') {
        $b = ConvertFrom-Json (Read-Body $req)
        $nom = ([string]$b.nom).Trim(); $prenom = ([string]$b.prenom).Trim()
        $ident = ([string]$b.identifiant).Trim().ToLower(); $pw = [string]$b.motdepasse
        $role = [string]$b.role
        if ($role -ne 'eleve' -and $role -ne 'prof') { Send-Err $ctx 400 'invalide'; return }
        if (-not $nom -or -not $prenom -or $nom.Length -gt 60 -or $prenom.Length -gt 60) { Send-Err $ctx 400 'nom_requis'; return }
        if ($ident -cnotmatch '^[a-z0-9._-]{3,40}$') { Send-Err $ctx 400 'identifiant_invalide'; return }
        if ($pw.Length -lt 6) { Send-Err $ctx 400 'motdepasse_court'; return }
        foreach ($u in $Users) { if ($u.identifiant -eq $ident) { Send-Err $ctx 409 'identifiant_pris'; return } }
        $classeId = $null
        if ($role -eq 'prof') {
            if (([string]$b.codeProf).Trim() -cne $Config.codeProf) { Send-Err $ctx 403 'code_prof'; return }
        } else {
            $classeId = [string]$b.classeId
            if ($classeId -cnotmatch '^[a-z0-9]{1,30}$') { Send-Err $ctx 400 'classe_requise'; return }
        }
        $sel = New-Hex 16
        $nu = @{ id = (New-Hex 6); role = $role; nom = $nom; prenom = $prenom; identifiant = $ident; classeId = $classeId; sel = $sel; hash = (Get-Hash $pw $sel) }
        [void]$Users.Add($nu); Save-Users
        if ($role -eq 'eleve') {
            Set-Doc "eleve/$($nu.id)/profil" (ConvertTo-Json @{ nom = $nom; prenom = $prenom; classeId = $classeId } -Compress)
        }
        $t = New-Hex 24; $Sessions[$t] = $nu.id
        Send-Json $ctx 200 ('{"token":"' + $t + '","user":' + (Get-UserJson $nu) + '}')
        return
    }

    if ($route -eq 'POST /api/connexion') {
        $b = ConvertFrom-Json (Read-Body $req)
        $ident = ([string]$b.identifiant).Trim().ToLower(); $pw = [string]$b.motdepasse
        $found = $null
        foreach ($u in $Users) { if ($u.identifiant -eq $ident) { $found = $u } }
        if (-not $found -or (Get-Hash $pw $found.sel) -cne $found.hash) { Send-Err $ctx 401 'identifiants'; return }
        $t = New-Hex 24; $Sessions[$t] = $found.id
        Send-Json $ctx 200 ('{"token":"' + $t + '","user":' + (Get-UserJson $found) + '}')
        return
    }

    if (-not $user) { Send-Err $ctx 401 'non_connecte'; return }
    $estProf = ($user.role -eq 'prof')

    if ($route -eq 'GET /api/moi') { Send-Json $ctx 200 (Get-UserJson $user); return }
    if ($route -eq 'POST /api/deconnexion') { $Sessions.Remove($tok); Send-Json $ctx 200 '{"ok":true}'; return }

    if ($route -eq 'GET /api/profs') {
        $items = foreach ($u in $Users) { if ($u.role -eq 'prof') { ConvertTo-Json @{ id = $u.id; nom = $u.nom; prenom = $u.prenom } -Compress } }
        Send-Json $ctx 200 ('[' + ($items -join ',') + ']')
        return
    }

    if ($route -eq 'GET /api/eleves') {
        if (-not $estProf) { Send-Err $ctx 403 'interdit'; return }
        $parts = foreach ($u in $Users) {
            if ($u.role -eq 'eleve') {
                $d = foreach ($s in $Sections) { '"' + $s + '":' + (Get-Doc "eleve/$($u.id)/$s") }
                '{"id":"' + $u.id + '","identifiant":' + (ConvertTo-Json ([string]$u.identifiant) -Compress) + ',"docs":{' + ($d -join ',') + '}}'
            }
        }
        Send-Json $ctx 200 ('[' + ($parts -join ',') + ']')
        return
    }

    if ($route -eq 'POST /api/admin/motdepasse' -or $route -eq 'POST /api/admin/supprimer') {
        if (-not $estProf) { Send-Err $ctx 403 'interdit'; return }
        $b = ConvertFrom-Json (Read-Body $req)
        $cible = Find-User ([string]$b.id)
        if (-not $cible -or $cible.role -ne 'eleve') { Send-Err $ctx 404 'introuvable'; return }
        if ($route.EndsWith('motdepasse')) {
            $pw = [string]$b.motdepasse
            if ($pw.Length -lt 6) { Send-Err $ctx 400 'motdepasse_court'; return }
            $cible.sel = New-Hex 16; $cible.hash = Get-Hash $pw $cible.sel
            Save-Users
        } else {
            $Users.Remove($cible); Save-Users
            foreach ($s in $Sections) { $Cache.Remove("eleve/$($cible.id)/$s") }
            foreach ($k in @($Sessions.Keys)) { if ($Sessions[$k] -eq $cible.id) { $Sessions.Remove($k) } }
            $dir = Join-Path $Docs "eleve\$($cible.id)"
            if ([IO.Directory]::Exists($dir)) { [IO.Directory]::Delete($dir, $true) }
        }
        Send-Json $ctx 200 '{"ok":true}'
        return
    }

    if ($path.StartsWith('/api/doc/')) {
        $key = $path.Substring(9)
        $ecriture = $false
        if ($key -cmatch '^commun/(classes|entreprises)$') {
            $ecriture = $estProf
        } elseif ($key -cmatch '^eleve/([a-f0-9]{12})/([a-z]+)$') {
            $proprio = $Matches[1]; $section = $Matches[2]
            if ($Sections -notcontains $section) { Send-Err $ctx 404 'introuvable'; return }
            if (-not $estProf -and $user.id -ne $proprio) { Send-Err $ctx 403 'interdit'; return }
            if (-not (Find-User $proprio)) { Send-Err $ctx 404 'introuvable'; return }
            $ecriture = $estProf -or ($section -ne 'prof')
        } else { Send-Err $ctx 404 'introuvable'; return }

        if ($m -eq 'GET') { Send-Json $ctx 200 (Get-Doc $key); return }
        if ($m -eq 'PUT') {
            if (-not $ecriture) { Send-Err $ctx 403 'interdit'; return }
            $body = Read-Body $req
            try { [void](ConvertFrom-Json $body) } catch { Send-Err $ctx 400 'invalide'; return }
            Set-Doc $key $body
            Send-Json $ctx 200 '{"ok":true}'
            return
        }
    }
    Send-Err $ctx 404 'introuvable'
}

# ---------- Demarrage ----------
$reseau = $true
$listener = New-Object System.Net.HttpListener
try { $listener.Prefixes.Add("http://+:$Port/"); $listener.Start() }
catch {
    $reseau = $false
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$Port/")
    $listener.Start()
}
Write-Host ''
Write-Host '  SUIVI DES STAGES - serveur demarre' -ForegroundColor Green
Write-Host "  Sur cet ordinateur : http://localhost:$Port/"
if ($reseau) {
    try {
        foreach ($ip in [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName())) {
            if ($ip.AddressFamily -eq 'InterNetwork') { Write-Host "  Depuis le reseau   : http://$($ip):$Port/" }
        }
    } catch {}
} else {
    Write-Host '  (acces limite a cet ordinateur : voir LISEZMOI.txt pour ouvrir au reseau)' -ForegroundColor Yellow
}
Write-Host "  Code d'inscription des professeurs : $($Config.codeProf)" -ForegroundColor Cyan
Write-Host '  Laissez cette fenetre ouverte. Ctrl+C pour arreter.'
Write-Host ''

try {
    while ($listener.IsListening) {
        $task = $listener.GetContextAsync()
        while (-not $task.Wait(300)) { }
        $ctx = $task.Result
        try { Handle $ctx }
        catch {
            Write-Host "Erreur : $_" -ForegroundColor Red
            try { Send-Err $ctx 500 'serveur' } catch { try { $ctx.Response.Abort() } catch {} }
        }
    }
} finally { $listener.Stop() }
