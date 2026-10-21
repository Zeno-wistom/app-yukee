/**
 * 挂灯选择器输入适配层（React hook）。
 *
 * 职责：把「原始视觉事件」翻译成「选择器命令」，且只在
 * selectionActive=true 时生效 —— 严格遵守
 * Input Adapter → Product State → UI Feedback 结构。
 *
 * - hand 模式：CameraVision.onHandSwipe（挥手轨迹判定）→ next / prev
 * - head 模式：摄像头手势方向（现有 GestureDetector）→ 左转头 = next，右转头 = prev
 * - 确认（两种模式共用）：NodDetector（向下点头）
 *
 * 防双触发：CameraVision 内部 detector 自带 cooldown + armed 机制；
 * 适配层再叠加 phase 门控，selection 未激活时直接忽略。
 * Hand 模型未就绪时不静默启用 yaw，避免设置为 Hand 后两种输入同时生效。
 */
import { useEffect, useRef } from "react";
import { cameraVision } from "./CameraVision";
import type { SelectionInputMode } from "./types";

export interface LampInputCallbacks {
  next: () => void;
  prev: () => void;
  confirm: () => void;
  cancel: () => void;
}

export function useLampInput(
  active: boolean,
  mode: SelectionInputMode,
  callbacks: LampInputCallbacks,
) {
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;
  useEffect(() => {
    cameraVision.setSelectionMode(mode);
  }, [mode]);

  useEffect(() => {
    cameraVision.setSelectionActive(active);
    return () => cameraVision.setSelectionActive(false);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const offSwipe = cameraVision.onHandSwipe((dir) => {
      if (mode !== "hand") return;
      // 物理约定：手向左挥 = 卡片往左飞 = 看到右边那张（next）
      if (dir === "left") cbRef.current.next();
      else cbRef.current.prev();
    });
    const offAction = cameraVision.onAction((direction) => {
      // head 模式才消费头部方向；hand 模式下头部方向交给游戏/其他逻辑
      if (mode !== "head") return;
      // 左转头（dYaw>0 → "left"）= next；右转头 = prev
      if (direction === "left") cbRef.current.next();
      else if (direction === "right") cbRef.current.prev();
    });
    const offNod = cameraVision.onNod(() => {
      cbRef.current.confirm();
    });
    return () => {
      offSwipe();
      offAction();
      offNod();
    };
  }, [active, mode]);
}
