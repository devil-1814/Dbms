import { currentUser } from "../lib/auth";
import Dashboard from "./ui/Dashboard";
export default async function Home() {
  const user = await currentUser();
  return <Dashboard initialUser={user ? { id: user.id, name: user.name, role: user.role } : null} />;
}