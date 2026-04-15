import os from 'os';

export function getSimpleOSName(): string {
  const platform = os.platform();
  const release = os.release();
  
  if (platform === 'win32') {
    const versionMap: Record<string, string> = {
      '11.0': 'Windows 11',
      '10.0': 'Windows 10',
      '6.3': 'Windows 8.1',
      '6.2': 'Windows 8',
      '6.1': 'Windows 7',
      '6.0': 'Windows Vista',
      '5.1': 'Windows XP'
    };
    
    for (const [key, value] of Object.entries(versionMap)) {
      if (release.startsWith(key)) {
        return value;
      }
    }
    return `Windows ${release}`;
  }
  
  if (platform === 'darwin') {
    const darwinVersion = parseInt(release.split('.')[0]);
    const macosMap: Record<number, string> = {
      23: 'macOS 14 Sonoma',
      22: 'macOS 13 Ventura',
      21: 'macOS 12 Monterey',
      20: 'macOS 11 Big Sur',
      19: 'macOS 10.15 Catalina',
      18: 'macOS 10.14 Mojave',
      17: 'macOS 10.13 High Sierra',
      16: 'macOS 10.12 Sierra'
    };
    return macosMap[darwinVersion] || `macOS ${release}`;
  }
  
  if (platform === 'linux') {
    const isDocker = checkIfRunningInDocker();
    
    if (isDocker) {
      const shortVersion = release.split('.').slice(0, 2).join('.');
      return `Linux ${shortVersion}`;
    }
    
    try {
      const fs = require('fs');
      if (fs.existsSync('/etc/os-release')) {
        const content = fs.readFileSync('/etc/os-release', 'utf-8');
        const nameMatch = content.match(/^NAME=["']?([^"'\n]+)["']?$/m);
        const versionMatch = content.match(/^VERSION_ID=["']?([^"'\n]+)["']?$/m);
        const prettyNameMatch = content.match(/^PRETTY_NAME=["']?([^"'\n]+)["']?$/m);
        
        if (prettyNameMatch) {
          return prettyNameMatch[1].replace(/ LTS$/, '');
        }
        
        if (nameMatch && versionMatch) {
          const name = nameMatch[1].replace(/ LTS$/, '');
          const version = versionMatch[1];
          return `${name} ${version}`;
        }
      }
    } catch (e) {
    }
    
    const shortVersion = release.split('.').slice(0, 2).join('.');
    return `Linux ${shortVersion}`;
  }
  
  return `${platform} ${release}`;
}


function checkIfRunningInDocker(): boolean {
  try {
    const fs = require('fs');
    return fs.existsSync('/.dockerenv') || 
           fs.existsSync('/run/.containerenv') ||
           (fs.existsSync('/proc/1/cgroup') && 
            fs.readFileSync('/proc/1/cgroup', 'utf-8').includes('docker'));
  } catch (e) {
    return false;
  }
}

export function getSystemInfo() {
  const isDocker = checkIfRunningInDocker();
  
  return {
    osName: getSimpleOSName(),
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    uptime: os.uptime(),
    cpus: os.cpus().length,
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    isDocker: isDocker,
    nodeVersion: process.version,
    containerId: os.hostname()
  };
}