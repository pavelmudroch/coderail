# Requires Windows PowerShell 5.1 or PowerShell 7 on Windows.
# Keep preferences and helper functions local when invoked through irm | iex.
& {
    $ErrorActionPreference = 'Stop'
    $PSNativeCommandUseErrorActionPreference = $false
    $installerArguments = $args
    $api = 'https://api.github.com/repos/pavelmudroch/coderail'

    function Write-InstallLog([string] $Message) {
        Write-Host "install: $Message"
    }

    function Test-PositiveInteger($Value) {
        return ($Value -is [int] -or $Value -is [long] -or $Value -is [double]) -and
            $Value -gt 0 -and [Math]::Floor($Value) -eq $Value
    }

    function Test-RegularFile([string] $Path) {
        $item = Get-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
        return $null -ne $item -and -not $item.PSIsContainer -and
            -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)
    }

    function Get-LauncherTarget {
        if (-not (Test-RegularFile $launcher)) { return }
        $text = [IO.File]::ReadAllText($launcher)
        if ($text -cmatch '\A@echo off\r\n"%~dp0\.\.\\libexec\\(cr-[A-Za-z0-9_.-]+\.exe)" %\*\r\nexit /b %errorlevel%\r\n\z') {
            return Join-Path $libexec $Matches[1]
        }
    }

    function Get-AssetId([string] $Name) {
        $matching = @($assets | Where-Object {
            $_.name -ceq $Name -and $_.state -ceq 'uploaded' -and
                (Test-PositiveInteger $_.id)
        })
        if ($matching.Count -ne 1) { throw "Missing or invalid release asset: $Name" }
        return $matching[0].id
    }

    function Get-Download([string] $Accept, [string] $Uri, [string] $Path) {
        Invoke-WebRequest -UseBasicParsing -Uri $Uri -Headers @{
            Accept = $Accept
            'User-Agent' = 'coderail-installer'
        } -OutFile $Path
    }

    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
        throw 'Unsupported operating system; use install.sh on Linux or macOS'
    }
    $root = $env:CODERAIL_INSTALL_ROOT
    if ([string]::IsNullOrEmpty($root)) {
        if ([string]::IsNullOrEmpty($env:USERPROFILE)) { throw 'USERPROFILE is required' }
        $root = Join-Path $env:USERPROFILE '.coderail'
    }
    $null = New-Item -ItemType Directory -Path $root -Force
    $root = (Resolve-Path -LiteralPath $root).ProviderPath
    $libexec = Join-Path $root 'libexec'
    $launcher = Join-Path $root 'bin\cr.cmd'
    Write-InstallLog "Installing Coderail into $root"

    # Only delegate to the exact launcher format owned by this installation.
    $target = Get-LauncherTarget
    $library = Get-Item -LiteralPath $libexec -Force -ErrorAction SilentlyContinue
    $bin = Get-Item -LiteralPath (Join-Path $root 'bin') -Force -ErrorAction SilentlyContinue
    if ($target -and (Test-RegularFile $target) -and $library -and $bin -and
        -not ($library.Attributes -band [IO.FileAttributes]::ReparsePoint) -and
        -not ($bin.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        $health = $null
        try { $health = & $launcher --version 2>$null } catch { $health = $null }
        if ($LASTEXITCODE -eq 0 -and "$health" -clike 'Coderail version *') {
            Write-InstallLog 'Updating existing installation to the latest stable release...'
            & $launcher @installerArguments upgrade --version latest
            if ($LASTEXITCODE -ne 0) { throw "Upgrade failed with exit code $LASTEXITCODE" }
            Write-InstallLog "Installation complete: $launcher"
            return
        }
    }

    $architecture = $env:PROCESSOR_ARCHITEW6432
    if ([string]::IsNullOrEmpty($architecture)) { $architecture = $env:PROCESSOR_ARCHITECTURE }
    switch ($architecture) {
        'AMD64' { $arch = 'x86_64' }
        'ARM64' { $arch = 'aarch64' }
        default { throw 'Unsupported architecture' }
    }
    $name = "coderail-$arch-pc-windows-msvc.zip"
    $temporary = Join-Path ([IO.Path]::GetTempPath()) ("coderail-install." + [Guid]::NewGuid())
    $null = New-Item -ItemType Directory -Path $temporary
    $bootstrap = $null
    $previousProtocol = [Net.ServicePointManager]::SecurityProtocol
    try {
        [Net.ServicePointManager]::SecurityProtocol = $previousProtocol -bor [Net.SecurityProtocolType]::Tls12
        Write-InstallLog 'Resolving the latest stable release...'
        $releasePath = Join-Path $temporary 'release'
        Get-Download 'application/vnd.github+json' "$api/releases/latest" $releasePath
        $release = [IO.File]::ReadAllText($releasePath) | ConvertFrom-Json
        if ($release.draft -isnot [bool] -or $release.draft -or
            $release.prerelease -isnot [bool] -or $release.prerelease -or
            -not (Test-PositiveInteger $release.id) -or
            $release.tag_name -isnot [string] -or
            $release.tag_name -cnotmatch '\Av?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\z' -or
            $release.target_commitish -isnot [string] -or
            $release.target_commitish -cnotmatch '\A[0-9a-f]{40}\z' -or
            # ConvertFrom-Json in PowerShell 7 converts ISO timestamps to dates.
            ($release.updated_at -isnot [string] -and
                $release.updated_at -isnot [DateTime] -and
                $release.updated_at -isnot [DateTimeOffset])) {
            throw 'Invalid latest stable release'
        }
        $tag = $release.tag_name
        $version = $tag -creplace '\Av', ''
        Write-InstallLog "Selected Coderail $version; fetching release asset details..."
        $assetsPath = Join-Path $temporary 'assets'
        Get-Download 'application/vnd.github+json' "$api/releases/$($release.id)/assets?per_page=100" $assetsPath
        $assets = [IO.File]::ReadAllText($assetsPath) | ConvertFrom-Json
        $archiveId = Get-AssetId $name
        $checksumId = Get-AssetId "$name.sha256"
        $archivePath = Join-Path $temporary 'archive.zip'
        $checksumPath = Join-Path $temporary 'checksum'
        Write-InstallLog "Downloading $name..."
        Get-Download 'application/octet-stream' "$api/releases/assets/$archiveId" $archivePath
        Write-InstallLog 'Downloading and verifying the SHA-256 checksum...'
        Get-Download 'application/octet-stream' "$api/releases/assets/$checksumId" $checksumPath
        $digest = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
        $checksum = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($checksumPath))
        if ($checksum -cne "$digest  $name`n") { throw 'Archive SHA-256 mismatch' }

        $null = New-Item -ItemType Directory -Path $libexec -Force
        if ((Get-Item -LiteralPath $libexec -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw 'Unsafe executable directory'
        }
        Write-InstallLog 'Extracting the bootstrap executable...'
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
        try {
            $entries = @($archive.Entries | Where-Object { $_.FullName -ceq 'cr.exe' })
            if ($entries.Count -ne 1) { throw 'Could not extract bootstrap executable' }
            $bootstrapPath = Join-Path $libexec ("cr-bootstrap." + [Guid]::NewGuid() + '.exe')
            $output = [IO.File]::Open($bootstrapPath, [IO.FileMode]::CreateNew)
            $bootstrap = $bootstrapPath
            try {
                $inputStream = $entries[0].Open()
                try { $inputStream.CopyTo($output) } finally { $inputStream.Dispose() }
            } finally { $output.Dispose() }
        } finally { $archive.Dispose() }

        Write-InstallLog "Installing Coderail $version..."
        & $bootstrap @installerArguments upgrade --version $version
        if ($LASTEXITCODE -ne 0) { throw "Upgrade failed with exit code $LASTEXITCODE" }
        if (-not (Test-RegularFile $launcher)) {
            throw "Bootstrap exited successfully without installing $launcher; release $tag may need an installer compatibility fix"
        }
        Write-InstallLog "Installation complete: $launcher"
    } finally {
        [Net.ServicePointManager]::SecurityProtocol = $previousProtocol
        if ($bootstrap -and (Test-Path -LiteralPath $bootstrap)) {
            # Activation may have made this executable active or recorded ownership.
            # If ownership cannot be determined, leave the executable for upgrade cleanup.
            try {
                $active = Get-LauncherTarget
                $owned = $false
                $manifestPath = Join-Path $root '.coderail-distribution.json'
                if (Test-Path -LiteralPath $manifestPath) {
                    $manifest = [IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
                    $ownedPath = 'libexec/' + [IO.Path]::GetFileName($bootstrap)
                    $owned = @($manifest.files | Where-Object { $_.path -ceq $ownedPath }).Count -gt 0
                }
                if ($active -ne $bootstrap -and -not $owned) {
                    Remove-Item -LiteralPath $bootstrap -Force
                }
            } catch { Write-Warning "install: Could not clean up bootstrap executable: $_" }
        }
        Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue
    }
} @args
