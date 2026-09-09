// 规格格式化工具（根据文档 09，null 与 0 必须明确区分）
import { DiskType } from '@/types/api';

export function formatTransfer(transferGb: number | null | undefined): string {
  if (transferGb === null || transferGb === undefined) return '未知';
  if (transferGb === 0) return '不限量';
  if (transferGb >= 1024 && transferGb % 1024 === 0) {
    return `${transferGb / 1024} TB`;
  }
  return `${transferGb} GB`;
}

export function formatPort(portMbps: number | null | undefined): string {
  if (portMbps === null || portMbps === undefined) return '未知';
  if (portMbps >= 1000 && portMbps % 1000 === 0) {
    return `${portMbps / 1000} Gbps`;
  }
  return `${portMbps} Mbps`;
}

export function formatMemory(memoryMb: number | null | undefined): string {
  if (!memoryMb) return '—';
  if (memoryMb >= 1024 && memoryMb % 1024 === 0) {
    return `${memoryMb / 1024} GB`;
  }
  return `${memoryMb} MB`;
}

export function formatDisk(diskGb: number | null | undefined, diskType: DiskType = 'ssd'): string {
  if (!diskGb) return '—';
  const typeUpper = diskType === 'unknown' ? '' : ` ${diskType.toUpperCase()}`;
  return `${diskGb} GB${typeUpper}`;
}
