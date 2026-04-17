export async function projectExists(projectId: string): Promise<boolean> {
  return projectId !== "not-found";
}
