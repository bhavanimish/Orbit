import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { db } from "../firebaseConfig";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { approvePlan, rejectPlan } from "../lib/planService";
import type { RootStackParamList } from "../navigation/types";

type Route = RouteProp<RootStackParamList, "PlanReview">;
type Nav = NativeStackNavigationProp<RootStackParamList, "PlanReview">;

interface EditableTask {
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  dueAt: string;
  estimatedDurationMinutes: number;
  order: number;
}

export default function PlanReviewScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { planId, goalTitle } = route.params;
  const { user } = useAuth();

  const [plan, setPlan] = useState<any>(null);
  const [tasks, setTasks] = useState<EditableTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "plans", planId),
      (snap) => {
        if (!snap.exists()) {
          setError("Plan not found.");
          setLoading(false);
          return;
        }
        const data = snap.data();
        setPlan(data);
        if (tasks.length === 0 && data.tasks) {
          const list: EditableTask[] = data.tasks.map((t: any, idx: number) => ({
            title: t.title || "",
            description: t.description || "",
            priority: t.priority || "medium",
            dueAt: t.dueAt || "",
            estimatedDurationMinutes: t.estimatedDurationMinutes || 60,
            order: t.order ?? idx + 1,
          }));
          setTasks(list);
        }
        setLoading(false);
      },
      (e) => {
        console.error(e);
        setError("Failed to load plan.");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [planId]);

  const updateTaskField = (index: number, field: keyof EditableTask, value: any) => {
    setTasks((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleApprove = async () => {
    if (!user) return;
    for (let i = 0; i < tasks.length; i++) {
      if (!tasks[i].title.trim()) {
        Alert.alert("Validation", `Task #${i + 1} must have a title.`);
        return;
      }
    }
    setApproving(true);
    try {
      await approvePlan(
        planId,
        user.uid,
        tasks.map((t, idx) => ({
          title: t.title.trim(),
          description: t.description.trim(),
          priority: t.priority,
          dueAt: t.dueAt.trim(),
          estimatedDurationMinutes: Number(t.estimatedDurationMinutes) || 60,
          order: t.order ?? idx + 1,
        })),
      );
      Alert.alert("Success", "Plan approved! Tasks have been scheduled.");
      navigation.goBack();
    } catch (e: any) {
      console.error(e);
      Alert.alert("Approval failed", e.message || "Failed to approve plan.");
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!user) return;
    setRejecting(true);
    try {
      await rejectPlan(planId, user.uid);
      Alert.alert("Plan Rejected", "The proposed plan was rejected.");
      navigation.goBack();
    } catch (e: any) {
      console.error(e);
      Alert.alert("Rejection failed", e.message || "Failed to reject plan.");
    } finally {
      setRejecting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#818CF8" />
      </View>
    );
  }

  if (error || !plan) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error || "Plan not found"}</Text>
      </View>
    );
  }

  const isMock = plan.providerMode === "mock";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.goalHeader}>{goalTitle}</Text>
      <Text style={styles.planTitle}>Plan Review (v{plan.version || 1})</Text>

      {/* Provider Mode Banner */}
      <View style={[styles.banner, isMock ? styles.mockBanner : styles.openaiBanner]}>
        <Text style={styles.bannerText}>
          {isMock ? "⚡ MOCK AI OUTPUT" : "🤖 OPENAI GENERATED OUTPUT"}
        </Text>
      </View>

      <Text style={styles.summary}>{plan.summary}</Text>

      {/* Notice Message */}
      <View style={styles.noticeBox}>
        <Text style={styles.noticeTitle}>What will happen when you approve:</Text>
        <Text style={styles.noticeBody}>
          Orbit will atomically schedule {tasks.length} actionable tasks into your goal timeline.
          You can edit priorities, dates, or titles below before confirming.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Proposed Tasks ({tasks.length})</Text>

      {tasks.map((task, idx) => (
        <View key={idx} style={styles.taskCard}>
          <Text style={styles.taskIndex}>Task {idx + 1}</Text>
          <TextInput
            style={styles.input}
            value={task.title}
            onChangeText={(v) => updateTaskField(idx, "title", v)}
            placeholder="Task Title"
            placeholderTextColor="#64748B"
          />
          <TextInput
            style={[styles.input, styles.descInput]}
            value={task.description}
            onChangeText={(v) => updateTaskField(idx, "description", v)}
            placeholder="Description (optional)"
            placeholderTextColor="#64748B"
            multiline
          />
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.halfInput]}
              value={task.dueAt}
              onChangeText={(v) => updateTaskField(idx, "dueAt", v)}
              placeholder="Due: YYYY-MM-DD"
              placeholderTextColor="#64748B"
            />
            <View style={styles.priorityGroup}>
              {(["low", "medium", "high"] as const).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.pBtn,
                    task.priority === p && styles.pBtnSelected,
                  ]}
                  onPress={() => updateTaskField(idx, "priority", p)}
                >
                  <Text style={styles.pText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      ))}

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.btn, styles.rejectBtn, (approving || rejecting) && styles.disabled]}
          onPress={handleReject}
          disabled={approving || rejecting}
        >
          {rejecting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Reject Plan</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.approveBtn, (approving || rejecting) && styles.disabled]}
          onPress={handleApprove}
          disabled={approving || rejecting}
        >
          {approving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Approve Plan</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#090A0F" },
  content: { padding: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#090A0F" },
  error: { color: "#EF4444", fontSize: 16 },
  goalHeader: { color: "#818CF8", fontSize: 14, fontWeight: "600", textTransform: "uppercase" },
  planTitle: { color: "#F8FAFC", fontSize: 24, fontWeight: "800", marginTop: 4 },
  banner: { padding: 10, borderRadius: 8, marginVertical: 12 },
  mockBanner: { backgroundColor: "#1E293B", borderColor: "#64748B", borderWidth: 1 },
  openaiBanner: { backgroundColor: "#14532D", borderColor: "#22C55E", borderWidth: 1 },
  bannerText: { color: "#F8FAFC", fontWeight: "700", textAlign: "center", fontSize: 12 },
  summary: { color: "#94A3B8", fontSize: 15, lineHeight: 22, marginBottom: 16 },
  noticeBox: {
    backgroundColor: "#12141C",
    padding: 14,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#818CF8",
    marginBottom: 20,
  },
  noticeTitle: { color: "#F8FAFC", fontWeight: "700", marginBottom: 4 },
  noticeBody: { color: "#94A3B8", fontSize: 13, lineHeight: 18 },
  sectionTitle: { color: "#F8FAFC", fontSize: 18, fontWeight: "700", marginBottom: 12 },
  taskCard: {
    backgroundColor: "#12141C",
    padding: 14,
    borderRadius: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#1E2230",
  },
  taskIndex: { color: "#818CF8", fontSize: 12, fontWeight: "700", marginBottom: 6 },
  input: {
    backgroundColor: "#1E2230",
    color: "#F8FAFC",
    padding: 10,
    borderRadius: 6,
    marginBottom: 8,
  },
  descInput: { height: 60, textAlignVertical: "top" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  halfInput: { flex: 1, marginRight: 8, marginBottom: 0 },
  priorityGroup: { flexDirection: "row" },
  pBtn: { paddingVertical: 8, paddingHorizontal: 10, backgroundColor: "#090A0F", borderRadius: 4, marginLeft: 4 },
  pBtnSelected: { backgroundColor: "#818CF8" },
  pText: { color: "#F8FAFC", fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  actionRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 24, marginBottom: 40 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: "center" },
  rejectBtn: { backgroundColor: "#EF4444", marginRight: 8 },
  approveBtn: { backgroundColor: "#10B981", marginLeft: 8 },
  disabled: { opacity: 0.5 },
  btnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
});

