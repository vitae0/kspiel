import type {Formation} from "./types";

/** A manual order stays authoritative throughout all its waypoints and combat approach. */
export function playerOrderPending(unit:Formation):boolean{
  return unit.order?.manual===true;
}

/** Front AI may resume only after the human order has finished or been replaced. */
export function canAutoAssignFront(unit:Formation):boolean{
  return !playerOrderPending(unit)
    &&unit.order?.type!=="retreat"
    &&!unit.order?.marchId
    &&unit.organization>=16
    &&unit.strength>=10;
}
