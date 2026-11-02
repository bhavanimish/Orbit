import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { completeTask, cancelTask, rescheduleTask } from "../lib/planService";

export default function TaskDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const { taskId } = route.params as { taskId: string };

  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reschedule, setReschedule] = useState(false);
  const [newDue, setNewDue] = useState("");

  useEffect(() => {
    if (!user) return;
    const taskRef = doc(db, "tasks", taskId);
    getDoc(taskRef)
      .then((snap) => {
        if (snap.exists()) {
          setTask({ id: snap.id, ...snap.data() });
        } else {
          setError("Task not found.");
        }
        setLoading(false);
      })
      .catch((e) => {
        console.error(e);
        setError("Failed to load task.");
        setLoading(false);
      });
  }, [user, taskId]);

  const handleComplete = async () => {
    if (!user) return;
    setActionLoading(true);
    try {
      await completeTask(taskId, user.uid);
      navigation.goBack();
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", e.message || "Could not complete task.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!user) return;
    setActionLoading(true);
    try {
      await cancelTask(taskId, user.uid);
      navigation.goBack();
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", e.message || "Could not cancel task.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReschedule = async () => {
    if (!user) return;
    if (!newDue.trim()) {
      Alert.alert("Validation", "Due date required.");
      return;
    }
    const text = newDue.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      Alert.alert("Validation", "Invalid date format. Use YYYY-MM-DD.");
      return;
    }
    setActionLoading(true);
    try {
      await rescheduleTask(taskId, user.uid, text);
      navigation.goBack();
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", e.message || "Could not reschedule task.");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#818CF8" />
      </View>
    );
  }
  if (error || !task) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error || "Task not found"}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{task.title}</Text>
      {task.description ? (
        <Text style={styles.desc}>{task.description}</Text>
      ) : null}
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Status:</Text>
        <Text style={[styles.metaVal, styles.statusVal]}>{task.status}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Priority:</Text>
        <Text style={styles.metaVal}>{task.priority}</Text>
      </View>
      {task.dueAt ? (
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Due:</Text>
          <Text style={styles.metaVal}>
            {task.dueAt.toDate?.().toISOString().split("T")[0] || String(task.dueAt)}
          </Text>
        </View>
      ) : null}

      <View style={styles.btnGroup}>
        <TouchableOpacity
          style={[styles.btn, styles.completeBtn, actionLoading && styles.disabled]}
          onPress={handleComplete}
          disabled={actionLoading}
        >
          {actionLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Complete Task</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.cancelBtn, actionLoading && styles.disabled]}
          onPress={handleCancel}
          disabled={actionLoading}
        >
          <Text style={styles.btnText}>Cancel Task</Text>
        </TouchableOpacity>

        {reschedule ? (
          <View style={styles.rescheduleSection}>
            <TextInput
              style={styles.input}
              placeholder="New due date (YYYY-MM-DD)"
              placeholderTextColor="#64748B"
              value={newDue}
              onChangeText={setNewDue}
            />
            <TouchableOpacity
              style={[styles.btn, styles.saveDueBtn, actionLoading && styles.disabled]}
              onPress={handleReschedule}
              disabled={actionLoading}
            >
              <Text style={styles.btnText}>Save New Due Date</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.btn, styles.rescheduleBtn, actionLoading && styles.disabled]}
            onPress={() => setReschedule(true)}
            disabled={actionLoading}
          >
            <Text style={styles.btnText}>Reschedule Task</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#090A0F", padding: 24 },
  center: { flex: 1, backgroundColor: "#090A0F", justifyContent: "center", alignItems: "center" },
  title: { color: "#F8FAFC", fontSize: 22, fontWeight: "700", marginBottom: 8 },
  desc: { color: "#94A3B8", fontSize: 15, lineHeight: 22, marginBottom: 16 },
  metaRow: { flexDirection: "row", marginBottom: 8, alignItems: "center" },
  metaLabel: { color: "#64748B", width: 70, fontSize: 14 },
  metaVal: { color: "#F8FAFC", fontSize: 14, fontWeight: "600" },
  statusVal: { textTransform: "uppercase", color: "#818CF8" },
  btnGroup: { marginTop: 24 },
  btn: { padding: 14, borderRadius: 8, alignItems: "center", marginTop: 10 },
  completeBtn: { backgroundColor: "#10B981" },
  cancelBtn: { backgroundColor: "#EF4444" },
  rescheduleBtn: { backgroundColor: "#6366F1" },
  saveDueBtn: { backgroundColor: "#818CF8", marginTop: 8 },
  disabled: { opacity: 0.5 },
  btnText: { color: "#fff", fontWeight: "700" },
  error: { color: "#EF4444", textAlign: "center", fontSize: 16 },
  rescheduleSection: { marginTop: 14, backgroundColor: "#12141C", padding: 12, borderRadius: 8 },
  input: {
    backgroundColor: "#1E2230",
    color: "#F8FAFC",
    padding: 10,
    borderRadius: 6,
  },
});
