// cgroup v2 resource sampler for the memory benchmark (claude-mem-rs#52).
//
// Once a second, for each named cgroup: cpu.stat usage_usec, memory.current,
// memory.peak, io.stat rbytes/wbytes summed over devices; plus the whole
// host's usage_usec (/sys/fs/cgroup/cpu.stat) and /proc/loadavg, so the load
// outside the bench cgroups can be reported. One CSV row per cgroup per
// sample, tagged with the harness's current phase.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';

const USER_APPS = `/sys/fs/cgroup/user.slice/user-${process.getuid?.() ?? 1000}.slice/user@${process.getuid?.() ?? 1000}.service/app.slice`;

/** The cgroup directory of a transient user service (`bench-cmr`, `bench-honcho`). */
export const userService = (name: string) => `${USER_APPS}/${name}.service`;

/** The cgroup directory of a running Docker container. */
export function dockerScope(container: string): string {
  const id = execFileSync('docker', ['inspect', '-f', '{{.Id}}', container], { encoding: 'utf8' }).trim();
  return `/sys/fs/cgroup/system.slice/docker-${id}.scope`;
}

function read(path: string): string {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
}

function usageUsec(dir: string): number {
  const m = /usage_usec (\d+)/.exec(read(`${dir}/cpu.stat`));
  return m ? Number(m[1]) : NaN;
}

function io(dir: string): [number, number] {
  let r = 0, w = 0;
  for (const line of read(`${dir}/io.stat`).split('\n')) {
    r += Number(/rbytes=(\d+)/.exec(line)?.[1] ?? 0);
    w += Number(/wbytes=(\d+)/.exec(line)?.[1] ?? 0);
  }
  return [r, w];
}

export class Sampler {
  phase = 'idle';
  private timer?: NodeJS.Timeout;
  private csv: string;
  private groups: Record<string, string>;
  constructor(csv: string, groups: Record<string, string>) {
    this.csv = csv;
    this.groups = groups;
    mkdirSync(dirname(csv), { recursive: true });
    if (!existsSync(csv)) writeFileSync(csv, 'ts,phase,group,usage_usec,memory_current,memory_peak,io_rbytes,io_wbytes,host_usage_usec,load1\n');
  }
  sample() {
    const ts = Date.now();
    const host = usageUsec('/sys/fs/cgroup');
    const load1 = read('/proc/loadavg').split(' ')[0];
    let rows = '';
    for (const [name, dir] of Object.entries(this.groups)) {
      const [r, w] = io(dir);
      rows += [ts, this.phase, name, usageUsec(dir), read(`${dir}/memory.current`).trim() || '', read(`${dir}/memory.peak`).trim() || '', r, w, host, load1].join(',') + '\n';
    }
    appendFileSync(this.csv, rows);
  }
  start() {
    this.sample();
    this.timer = setInterval(() => this.sample(), 1000);
    this.timer.unref();
    return this;
  }
  setPhase(p: string) {
    this.sample();
    this.phase = p;
  }
  stop() {
    this.sample();
    clearInterval(this.timer);
  }
}
