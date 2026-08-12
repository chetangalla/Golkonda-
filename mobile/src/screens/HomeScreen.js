import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { getMonuments } from '../utils/dataStore';
import { MapPin, ChevronRight, LogOut } from 'lucide-react-native';

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Welcome Explorer</Text>
          <Text style={styles.subtitle}>Where would you like to visit today?</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={() => navigation.replace('Login')}>
          <LogOut color="#ef4444" size={20} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={monuments}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={<Text style={{ color: '#94a3b8', textAlign: 'center', marginTop: 40 }}>No monuments strictly available yet.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => handleSelectMonument(item.id)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <View style={styles.iconBox}>
                  <MapPin color="#fff" size={24} />
                </View>
                <Text style={styles.cardTitle}>{item.name}</Text>
              </View>
              <ChevronRight color="#64748b" size={24} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 24, paddingTop: 48 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  title: { fontSize: 28, fontWeight: '800', color: '#f8fafc', letterSpacing: 0.5 },
  subtitle: { fontSize: 14, color: '#94a3b8', marginTop: 4 },
  logoutBtn: { backgroundColor: 'rgba(239, 68, 68, 0.15)', padding: 10, borderRadius: 12 },
  card: { backgroundColor: 'rgba(30, 41, 59, 0.7)', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(51, 65, 85, 0.8)', marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 },
  iconBox: { backgroundColor: '#3b82f6', padding: 12, borderRadius: 16 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#f8fafc' }
});
