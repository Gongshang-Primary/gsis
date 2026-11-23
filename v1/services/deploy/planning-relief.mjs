import Relief from "../../../shared/relief.js";
import Rules from "../../../shared/teaching-rules.js";
import Workload from "../../../shared/workload.js";
import {
  planningEligible,
  planningPerson,
} from "../../web/shared/deploy-eligibility.mjs";
import {
  planningView,
  workloadAliasView,
} from "../../web/shared/deploy-loads.mjs";

/** Read-only preview of the saved plan. Only the Deploy read response uses it. */
export function calculatePlanningRelief(version) {
  const view = workloadAliasView(planningView(version));
  const eligible = new Set(
    view.teachers.filter(teacher => planningEligible(view, teacher)).map(teacher => teacher.id),
  );
  const plan = {
    ...view,
    teachers: view.teachers.map(teacher => planningPerson(view, teacher)),
  };
  const workload = Workload.analyse(plan, teacher => {
    const rules = Rules.calculate(teacher, plan.offload);
    return { ...rules, eligible: rules.eligible && eligible.has(teacher.id) };
  });
  const result = Relief.analyse(plan, workload);
  return {
    versionId: version.id,
    revision: version.revision,
    reference: result.reference,
    teachers: result.rows.map(({ id, quota, reason }) => ({
      teacherId: id,
      R: quota,
      reason: reason || null,
    })),
  };
}
