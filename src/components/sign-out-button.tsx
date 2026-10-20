import { signOut } from "@/auth";

/** Server Action form, so it works in server components and without client JS. */
export function SignOutButton({ className = "hover:text-teal-700" }: { className?: string }) {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      <button type="submit" className={className}>
        Sign out
      </button>
    </form>
  );
}
