import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  FlatList,
  TextInput,
  ScrollView,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebaseConfig";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  addDoc,
  Timestamp,
} from "firebase/firestore";
import { generatePlan } from "../lib/planService";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList, "GoalDetail">;
type Route = RouteProp<RootStackParamList, "GoalDetail">;

export default function GoalDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { user } = useAuth();
  const { goalId, title } = route.params;

  const [tasks, setTasks] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState("low");
  const [newDue, setNewDue] = useState("");

  useEffect(() => {
    if (!user) return;
    const taskQuery = query(
      collection(db, "tasks"),
      where("ownerUid", "==", user.uid),
      where("goalId", "==", goalId),
    );
    const planQuery = query(
      collection(db, "plans"),
      where("ownerUid", "==", user.uid),
      where("goalId", "==", goalId),
    );

    const unsubTasks = onSnapshot(taskQuery, (snap) => {
      const list: any[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setTasks(list);
      setLoading(false);
    });

    const unsubPlans = onSnapshot(planQuery, (snap) => {
      const list: any[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      list.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
      setPlans(list);
    });

    return () => {
      unsubTasks();
      unsubPlans();
    };
  }, [user, goalId]);

  const progress = (() => {
    const total = tasks.filter((t) => t.status !== "cancelled").length;
    const done = tasks.filter((t) => t.status === "done").length;
    return total > 0 ? `${done}/${total}` : "0/0";
  })();

  const archiveGoal = async () => {
    try {
      const goalRef = doc(db, "goals", goalId);
      await updateDoc(goalRef, {
        status: "archived",
        updatedAt: serverTimestamp(),
      });
      navigation.goBack();
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Could not archive goal.");
    }
  };

  const handleGeneratePlan = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const planId = await generatePlan(goalId, user.uid);
      navigation.navigate("PlanReview", { planId, goalTitle: title });
    } catch (e: any) {
      console.error(e);
      Alert.alert("AI Planning", e.message || "Failed to generate plan.");
    } finally {
      setGenerating(false);
    }
  };

  const addTask = async () => {
    if (!newTitle.trim()) {
      Alert.alert("Validation", "Title required.");
      return;
    }
    if (!user) return;

    let dueAt: Timestamp | null = null;
    if (newDue.trim()) {
      const text = newDue.trim();
      const date = new Date(text);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || isNaN(date.getTime())) {
        Alert.alert("Validation", "Due date must look like 2026-12-31.");
        return;
      }
      dueAt = Timestamp.fromDate(date);
    }

    setAdding(true);
    try {
      const maxOrder = tasks.reduce((m, t) => Math.max(m, t.order ?? 0), 0);
      const data: Record<string, unknown> = {
        ownerUid: user.uid,
        goalId,
        title: newTitle.trim(),
        status: "todo",
        priority: newPriority,
        order: maxOrder + 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (dueAt) {
        data.dueAt = dueAt;
      }
      await addDoc(collection(db, "tasks"), data);
      setNewTitle("");
      setNewDue("");
      setNewPriority("low");
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Could not add task.");
    } finally {
      setAdding(false);
    }
  };

  const latestProposedPlan = plans.find((p) => p.status === "proposed");

  const renderTask = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.taskItem}
      onPress={() => navigation.navigate("TaskDetail", { taskId: item.id })}
    >
      <View style={styles.taskHeaderRow}>
        <Text style={styles.taskTitle}>{item.title}</Text>
        <Text style={[styles.taskPriority, { color: item.priority === "high" ? "#EF4444" : "#818CF8" }]}>
          {item.priority}
        </Text>
      </View>
      <Text style={styles.taskStatus}>{item.status}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{title}</Text>
      <Text style={styles.progress}>Progress: {progress}</Text>

      {/* AI Planning Section */}
      <View style={styles.aiCard}>
        <Text style={styles.aiTitle}>AI Assistant</Text>
        {latestProposedPlan ? (
          <TouchableOpacity
            style={styles.reviewPlanBtn}
            onPress={() =>
              navigation.navigate("PlanReview", {
                planId: latestProposedPlan.id,
                goalTitle: title,
              })
            }
          >
            <Text style={styles.reviewPlanText}>
              Review Proposed Plan (v{latestProposedPlan.version || 1}) →
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.generateBtn, generating && styles.disabledBtn]}
            onPress={handleGeneratePlan}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.generateBtnText}>✨ Generate AI Execution Plan</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#818CF8" />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : tasks.length === 0 ? (
        <Text style={styles.empty}>No tasks yet</Text>
      ) : (
        <FlatList
          data={tasks}
          renderItem={renderTask}
          keyExtractor={(i) => i.id}
          style={styles.taskList}
        />
      )}

      <View style={styles.addSection}>
        <TextInput
          style={styles.input}
          placeholder="Task title"
          placeholderTextColor="#64748B"
          value={newTitle}
          onChangeText={setNewTitle}
        />
        <TextInput
          style={styles.input}
          placeholder="Due (YYYY-MM-DD) optional"
          placeholderTextColor="#64748B"
          value={newDue}
          onChangeText={setNewDue}
        />
        <View style={styles.priorityRow}>
          {["low", "medium", "high"].map((p) => (
            <TouchableOpacity
              key={p}
              style={[
                styles.priorityBtn,
                newPriority === p && styles.prioritySelected,
              ]}
              onPress={() => setNewPriority(p)}
            >
              <Text style={styles.priorityText}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={[styles.addBtn, adding && styles.disabledBtn]}
          onPress={addTask}
          disabled={adding}
        >
          {adding ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.addBtnText}>Add Task</Text>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.archiveBtn} onPress={archiveGoal}>
        <Text style={styles.archiveText}>Archive Goal</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#090A0F", padding: 20 },
  header: { color: "#F8FAFC", fontSize: 22, fontWeight: "700" },
  progress: { color: "#818CF8", marginVertical: 6, fontWeight: "600" },
  error: { color: "#EF4444", textAlign: "center", marginTop: 20 },
  empty: { color: "#64748B", textAlign: "center", marginVertical: 20 },
  taskList: { maxHeight: 220 },
  taskItem: {
    padding: 12,
    backgroundColor: "#12141C",
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1E2230",
  },
  taskHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  taskTitle: { color: "#F8FAFC", fontWeight: "600", fontSize: 15 },
  taskPriority: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  taskStatus: { color: "#94A3B8", marginTop: 4, fontSize: 13, textTransform: "capitalize" },
  aiCard: {
    backgroundColor: "#12141C",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2D3748",
    marginVertical: 10,
  },
  aiTitle: { color: "#818CF8", fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 },
  generateBtn: {
    backgroundColor: "#6366F1",
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  generateBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  reviewPlanBtn: {
    backgroundColor: "#10B981",
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  reviewPlanText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  addSection: { marginTop: 10 },
  input: {
    backgroundColor: "#12141C",
    color: "#F8FAFC",
    padding: 10,
    marginBottom: 8,
    borderRadius: 6,
  },
  priorityRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  priorityBtn: {
    flex: 1,
    padding: 6,
    backgroundColor: "#1E2230",
    marginHorizontal: 2,
    borderRadius: 4,
  },
  prioritySelected: { backgroundColor: "#818CF8" },
  priorityText: { color: "#F8FAFC", textAlign: "center", fontSize: 12 },
  addBtn: {
    backgroundColor: "#10B981",
    padding: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  disabledBtn: { opacity: 0.6 },
  addBtnText: { color: "#fff", fontWeight: "600" },
  archiveBtn: {
    marginTop: 10,
    backgroundColor: "#EF4444",
    padding: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  archiveText: { color: "#fff", fontWeight: "600" },
});
