import { AlertCircleIcon } from "lucide-react";

import { login } from "@/lib/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const REASON_COPY = {
  expired: "Your session expired. Please sign in again.",
} as const;

// `returnTo` is the validated `redirect` search param from /login. Passing it
// through to login() is what makes a post-login deep link land back on the page
// the user originally asked for.
function Welcome({ returnTo, reason }: { returnTo: string; reason?: "expired" }) {
  return (
    <Card className="mt-10 text-center">
      <CardHeader>
        <CardTitle className="text-3xl">MolcaDx Maintenance</CardTitle>
        <CardDescription>Before you start, please sign in.</CardDescription>
      </CardHeader>
      {reason ? (
        <CardContent>
          <Alert variant="destructive" className="text-left">
            <AlertCircleIcon />
            <AlertDescription>{REASON_COPY[reason]}</AlertDescription>
          </Alert>
        </CardContent>
      ) : null}
      <CardFooter className="justify-center">
        {/* Full-page navigation on purpose — /api/login answers with a cross-origin
            302 to the IdP, which a router navigation cannot follow. */}
        <Button size="lg" onClick={() => login(returnTo)}>
          Sign In
        </Button>
      </CardFooter>
    </Card>
  );
}

export { Welcome };
