/**
 * 选择交互偏好 —— localStorage 持久化。
 *
 * `gameSelectionInputMode`: "hand" | "head"，默认 "head"。
 *   课堂版本正式唯一输入为 HEAD；hand 为 experimental 保留管线，
 *   仅在显式写入 localStorage 时启用（正式 UI 不暴露切换器）。
 * `gameSelectionHintSeen`: 首次教学提示是否已经展示过。
 *
 * 不需要后端；读写都在本机。设置修改后立即生效（不刷新页面）。
 */
import { useCallback, useEffect, useState } from "react";
import { cameraVision } from "../vision/CameraVision";
import type { SelectionInputMode } from "../vision/types";

const MODE_KEY = "gameSelectionInputMode";
const HINT_KEY = "gameSelectionHintSeen";

function readMode(): SelectionInputMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === "hand" ? "hand" : "head";
  } catch {
    return "head";
  }
}
function readHintSeen(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export interface SelectionPreference {
  inputMode: SelectionInputMode;
  setInputMode: (mode: SelectionInputMode) => void;
  hasSeenFirstHint: boolean;
  markHintSeen: () => void;
}

export function useSelectionPreference(): SelectionPreference {
  const [inputMode, setMode] = useState<SelectionInputMode>(readMode);
  const [hasSeenFirstHint, setHintSeen] = useState(readHintSeen);

  // 挂载后同步一次：让 CameraVision 感知当前模式（决定是否加载手部模型）
  useEffect(() => {
    cameraVision.setSelectionMode(inputMode);
  }, [inputMode]);

  const setInputMode = useCallback((mode: SelectionInputMode) => {
    setMode(mode);
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* 隐私模式下静默失败：仅会话内生效 */
    }
  }, []);

  const markHintSeen = useCallback(() => {
    setHintSeen(true);
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* 同上 */
    }
  }, []);

  return { inputMode, setInputMode, hasSeenFirstHint, markHintSeen };
}
