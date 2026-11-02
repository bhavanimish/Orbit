import React, { useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  FlatList,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebaseConfig";
import {
  collection,
  query,
  where,
  onSnapshot,
  DocumentData,
} from "firebase/firestore";

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [goals, setGoals] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "goals"),
      where("ownerUid", "==", user.uid),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: DocumentData[] = [];
        snap.forEach((doc) => {
          const data = doc.data();
          if (data.status !== "archived") {
            list.push({ id: doc.id, ...data });
          }
        });
        // newest first based on createdAt server timestamp
        list.sort((a, b) => {
          const aTime = a.createdAt?.seconds ?? 0;
          const bTime = b.createdAt?.seconds ?? 0;
          return bTime - aTime;
        });
        setGoals(list);
        setLoading(false);
      },
      (e) => {
        console.error(e);
        setError("Failed to load goals.");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [user]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (e) {
      Alert.alert("Sign out error", "Unable to sign out.");
    }
  };

  const renderItem = ({ item }: { item: DocumentData }) => (
    <TouchableOpacity
      style={styles.goalCard}
      activeOpacity={0.7}
      onPress={() =>
        navigation.navigate("GoalDetail", {
          goalId: item.id,
          title: item.title,
        })
      }
    >
      <Text style={styles.goalTitle}>{item.title}</Text>
      {item.description ? (
        <Text style={styles.goalDesc}>{item.description}</Text>
      ) : null}
      <Text style={styles.openHint}>Tap to open</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brandTitle}>ORBIT</Text>
        <TouchableOpacity onPress={handleSignOut}>
          <Text style={styles.signOut}>Sign out</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color="#818CF8" />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : goals.length === 0 ? (
          <Text style={styles.empty}>No goals yet</Text>
        ) : (
          <FlatList
            data={goals}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
          />
        )}
      </View>
      <TouchableOpacity
        style={styles.newBtn}
        onPress={() => navigation.navigate("CreateGoal")}
      >
        <Text style={styles.newBtnText}>New goal</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#090A0F",
    padding: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brandTitle: {
    color: "#818CF8",
    fontSize: 24,
    fontWeight: "800",
  },
  signOut: {
    color: "#EF4444",
  },
  content: {
    flex: 1,
    marginTop: 20,
  },
  empty: {
    color: "#64748B",
    textAlign: "center",
    marginTop: 40,
  },
  error: {
    color: "#EF4444",
    textAlign: "center",
    marginTop: 40,
  },
  goalCard: {
    backgroundColor: "#12141C",
    padding: 12,
    marginBottom: 12,
    borderRadius: 8,
  },
  goalTitle: {
    color: "#F8FAFC",
    fontWeight: "600",
  },
  goalDesc: {
    color: "#94A3B8",
    marginTop: 4,
  },
  openHint: {
    color: "#818CF8",
    fontSize: 12,
    marginTop: 8,
  },
  newBtn: {
    backgroundColor: "#10B981",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
  },
  newBtnText: {
    color: "#fff",
    fontWeight: "600",
  },
});
