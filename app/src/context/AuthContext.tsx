import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
} from "firebase/auth";
import { auth } from "../firebaseConfig";
import { db } from "../firebaseConfig";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function mapAuthError(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String((error as { code: unknown }).code);
    switch (code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "Incorrect email or password.";
      case "auth/email-already-in-use":
        return "An account with this email already exists.";
      case "auth/weak-password":
        return "Password is too weak. Please use at least 6 characters.";
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      case "auth/network-request-failed":
        return "Network connection failed. Please check your internet connection.";
      case "auth/too-many-requests":
        return "Too many failed attempts. Please try again later.";
      default:
        return "An error occurred during authentication. Please try again.";
    }
  }
  return "An error occurred during authentication. Please try again.";
}

/**
 * Create or update the Firestore user document.
 * Fields must exactly match the security rules.
 */
async function upsertUserDoc(
  uid: string,
  email: string,
  displayName?: string,
): Promise<void> {
  try {
    const userRef = doc(db, "users", uid);
    const data: any = {
      ownerUid: uid,
      email,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (displayName && displayName.trim()) {
      data.displayName = displayName.trim();
    }
    await setDoc(userRef, data, { merge: true });
  } catch (err) {
    console.error("Failed to create user profile", err);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) {
        try {
          const userRef = doc(db, "users", currentUser.uid);
          const snap = await getDoc(userRef);
          if (!snap.exists()) {
            await upsertUserDoc(currentUser.uid, currentUser.email ?? "", undefined);
          }
        } catch (err) {
          console.error("Error checking/creating user profile", err);
        }
      }
    });
    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string): Promise<void> => {
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      throw new Error(mapAuthError(err));
    }
  };

  const signUp = async (
    email: string,
    password: string,
    displayName?: string,
  ): Promise<void> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );
      if (displayName && displayName.trim()) {
        await updateProfile(userCredential.user, {
          displayName: displayName.trim(),
        });
        setUser({ ...userCredential.user });
      }
      await upsertUserDoc(userCredential.user.uid, email.trim(), displayName);
    } catch (err) {
      throw new Error(mapAuthError(err));
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      await fbSignOut(auth);
    } catch (err) {
      throw new Error(mapAuthError(err));
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
