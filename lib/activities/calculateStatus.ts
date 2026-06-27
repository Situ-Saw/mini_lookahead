export function calculateStatus(progress: number): string {
  if (progress === 0) return "Not Started";
  if (progress >= 100) return "Completed";
  return "In Progress";
}
