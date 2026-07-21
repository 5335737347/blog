import { connection } from "next/server";
import RegisterForm from "./RegisterForm";
import { getRegistrationCapabilities } from "@/lib/api/public-api";

export default async function RegisterPage() {
  await connection();
  return <RegisterForm initialCapabilities={await getRegistrationCapabilities()} />;
}
