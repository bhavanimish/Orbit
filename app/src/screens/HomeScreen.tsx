import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sign out.';
      Alert.alert('Sign out error', message);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brandTitle}>ORBIT</Text>
        <Text style={styles.statusBadge}>Online</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.welcomeLabel}>Signed in as</Text>
        <Text style={styles.userEmail}>{user?.email || 'No email provided'}</Text>
        {user?.displayName ? (
          <Text style={styles.displayName}>{user.displayName}</Text>
        ) : null}

        <View style={styles.divider} />

        <Text style={styles.placeholderNotice}>
          Dashboard & AI action capabilities will be wired in next phases.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.signOutButton, signingOut && styles.buttonDisabled]}
        onPress={handleSignOut}
        disabled={signingOut}
        activeOpacity={0.8}
      >
        {signingOut ? (
          <ActivityIndicator color="#EF4444" />
        ) : (
          <Text style={styles.signOutText}>Sign Out</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090A0F',
    padding: 24,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#818CF8',
    letterSpacing: 2,
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  card: {
    backgroundColor: '#12141C',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1E2230',
  },
  welcomeLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 6,
  },
  userEmail: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  displayName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#94A3B8',
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#1E2230',
    marginVertical: 18,
  },
  placeholderNotice: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  signOutButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  signOutText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '700',
  },
});
