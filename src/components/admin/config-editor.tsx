"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateAdminConfiguration, type ConfigFormState, type ConfigKey } from "@/server/admin/config-actions";

const initialState: ConfigFormState = { ok: false, error: "" };

export function ConfigEditor({ configKey, value }: { configKey: ConfigKey; value: unknown }) {
  const boundAction = updateAdminConfiguration.bind(null, configKey);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <Textarea
        name="json"
        defaultValue={JSON.stringify(value, null, 2)}
        rows={12}
        className="font-mono text-sm"
        spellCheck={false}
      />
      {!state.ok && state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && <p className="text-sm text-success">Saved.</p>}
      <Button type="submit" variant="accent" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
