import { computeRobotPose, sailClew } from "./robotRig";

/** 船员在桅杆右侧；缆绳绕过面孔两侧导索点，不直接跨过头部。 */
export function moonRopes(left: number, right: number) {
  const pose = computeRobotPose(left, right);
  return (["L", "R"] as const).map((side) => {
    const arm = side === "L" ? pose.left : pose.right;
    const clew = sailClew(side === "L" ? left : right, side);
    const hand = { x: arm.handX + 38, y: arm.handY };
    // 头部 x=339..377, y=173..200；两条绳从外侧经过，右绳先绕到头顶以上。
    const guide = side === "L" ? { x: 335, y: 204 } : { x: 430, y: 162 };
    return {
      side,
      hand,
      guide,
      clew,
      d: `M${hand.x} ${hand.y} L${guide.x} ${guide.y} L${clew.x} ${clew.y}`,
    };
  });
}
