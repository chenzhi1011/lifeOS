import { prepareLifeEventBatch } from "@/src/actions/batch-preparation";
import { writePreparedBatch } from "@/src/actions/batch-repository";
import { validateLifeEventBatchPayload } from "@/src/actions/batch-validation";
import { readActionContext } from "@/src/actions/repository";
import type { ApiPrincipal } from "@/src/auth/api-principal";

type Dependencies = {
  readContext: typeof readActionContext;
  writeBatch: typeof writePreparedBatch;
  now: () => Date;
};
const defaults: Dependencies = { readContext: readActionContext, writeBatch: writePreparedBatch, now: () => new Date() };

export async function recordLifeEventBatch(principal: ApiPrincipal, input: unknown, dependencies: Dependencies = defaults) {
  const command = validateLifeEventBatchPayload(input);
  const context = await dependencies.readContext(principal.userId);
  const prepared = await prepareLifeEventBatch(command, context, dependencies.now());
  return dependencies.writeBatch(principal.userId, prepared);
}
