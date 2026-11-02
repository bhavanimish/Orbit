import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { db } from "../firebaseConfig";
import {
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";

export default function CreateGoalScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [constraints, setConstraints] = useState<string[]>([]);
  const [constraintInput, setConstraintInput] = useState("");
  const [saving, setSaving] = useState(false);

  const addConstraint = () => {
    const trimmed = constraintInput.trim();
    if (!trimmed) return;
    if (constraints.length >= 20) {
      Alert.alert("Limit reached", "Maximum 20 constraints allowed.");
      return;
    }
    setConstraints([...constraints, trimmed]);
    setConstraintInput("");
  };

  const removeConstraint = (idx: number) => {
    setConstraints(constraints.filter((_, i) => i !== idx));
  };

  const validate = (): string | null => {
    if (!title.trim()) return "Title is required.";
    if (title.trim().length > 200) return "Title too long.";
    if (description && description.length > 2000) return "Description too long.";
    if (targetDate && targetDate.length > 64) return "Target date too long.";
    // simple YYYY-MM-DD regex
    if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      return "Target date must be YYYY-MM-DD.";
    }
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      Alert.alert("Validation error", err);
      return;
    }
    if (!user) {
      Alert.alert("User error", "Not signed in.");
      return;
    }
    setSaving(true);
    try {
      const data: any = {
        ownerUid: user.uid,
        title: title.trim(),
        status: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (description.trim()) data.description = description.trim();
      if (targetDate.trim()) data.targetDate = targetDate.trim();
      if (constraints.length) data.constraints = constraints;
      await addDoc(collection(db, "goals"), data);
      navigation.goBack();
    } catch (e) {
      console.error("Error creating goal", e);
      Alert.alert("Error", "Failed to create goal.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Title *</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Goal title"
      />
      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Optional description"
        multiline
        numberOfLines={4}
      />
      <Text style={styles.label}>Target Date (YYYY-MM-DD)</Text>
      <TextInput
        style={styles.input}
        value={targetDate}
        onChangeText={setTargetDate}
        placeholder="e.g., 2024-12-31"
      />
      <Text style={styles.label}>Constraints</Text>
      {constraints.map((c, i) => (
        <View key={i} style={styles.constraintRow}>
          <Text style={styles.constraintText}>{c}</Text>
          <TouchableOpacity onPress={() => removeConstraint(i)}>
            <Text style={styles.removeBtn}>✕</Text>
          </TouchableOpacity>
        </View>
      ))}
      <View style={styles.constraintInputRow}>
        <TextInput
          style={[styles.input, styles.flexGrow]}
          value={constraintInput}
          onChangeText={setConstraintInput}
          placeholder="Add constraint"
        />
        <TouchableOpacity onPress={addConstraint} style={styles.addBtn}>
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.disabledBtn]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveBtnText}>Save Goal</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: "#090A0F",
  },
  label: {
    color: "#94A3B8",
    marginBottom: 4,
  },
  input: {
    backgroundColor: "#12141C",
    color: "#F8FAFC",
    padding: 10,
    marginBottom: 12,
    borderRadius: 8,
  },
  multiline: {
    height: 80,
    textAlignVertical: "top",
  },
  constraintRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#12141C",
    padding: 8,
    borderRadius: 6,
    marginBottom: 6,
  },
  constraintText: {
    color: "#F8FAFC",
    flex: 1,
  },
  removeBtn: {
    color: "#EF4444",
    marginLeft: 8,
  },
  constraintInputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  flexGrow: {
    flex: 1,
  },
  addBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#818CF8",
    borderRadius: 6,
    marginLeft: 8,
  },
  addBtnText: {
    color: "#fff",
  },
  saveBtn: {
    backgroundColor: "#10B981",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  disabledBtn: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "600",
  },
});

