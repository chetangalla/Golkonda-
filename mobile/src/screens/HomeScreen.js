import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { getMonuments, logout } from '../utils/dataStore';
import { MapPin, ChevronRight, LogOut } from 'lucide-react-native';
import { colors, radius, shadow } from '../theme';

export default function HomeScreen({ navigation }) {
  const [monuments, setMonuments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMonuments = async () => {
      const data = await getMonuments();
      setMonuments(data);
      setLoading(false);
    };
    fetchMonuments();
  }, []);

  const handleSelectMonument = (monumentId) => {
    navigation.navigate('User', { monumentId });
  };

  const handleLogout = async () => {
    try { await logout(); } catch (_) {}
    navigation.replace('Login');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>GOLKONDA FORT</Text>
          <Text style={styles.title}>Welcome Explorer</Text>
          <Text style={styles.subtitle}>Where would you like to visit today?</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <LogOut color={colors.danger} size={20} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={monuments}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={<Text style={{ color: colors.inkMuted, textAlign: 'center', marginTop: 40 }}>No monuments available yet.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => handleSelectMonument(item.id)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <View style={styles.iconBox}>
                  <MapPin color={colors.accentInk} size={24} />
                </View>
                <Text style={styles.cardTitle}>{item.name}</Text>
              </View>
              <ChevronRight color={colors.inkFaint} size={24} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 24, paddingTop: 48 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  eyebrow: { fontSize: 11, fontWeight: '700', color: colors.accent, letterSpacing: 2.5, marginBottom: 6 },
  title: { fontSize: 28, fontWeight: '800', color: colors.ink, letterSpacing: 0.5 },
  subtitle: { fontSize: 14, color: colors.inkMuted, marginTop: 4 },
  logoutBtn: { backgroundColor: colors.dangerSoft, padding: 10, borderRadius: radius.md },
  card: { backgroundColor: colors.card, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, marginBottom: 16, ...shadow('#000', 0.25) },
  iconBox: { backgroundColor: colors.accent, padding: 12, borderRadius: radius.lg },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.ink }
});
