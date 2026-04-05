import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback, Keyboard } from 'react-native';

export default function LoginScreen({ navigation }) {
  const [pin, setPin] = useState('');

  const handleMasterLogin = () => {
    Keyboard.dismiss();
    if (pin === '1234') {
      navigation.replace('Master');
      setPin('');
    } else {
      Alert.alert('Invalid PIN', 'The PIN for the prototype is 1234');
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={{ flex: 1 }}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          <Text style={styles.title}>GPS Audio Tour</Text>
          <Text style={styles.subtitle}>Select your profile to continue</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tourist (User)</Text>
            <Text style={styles.cardDesc}>Experience the tour created by the admin.</Text>
            <TouchableOpacity style={styles.btnSync} onPress={() => navigation.replace('User')}>
              <Text style={styles.btnText}>Enter Tour</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Admin (Master)</Text>
            <Text style={styles.cardDesc}>Create targets and record audio.</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter PIN (1234)"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              keyboardType="numeric"
              value={pin}
              onChangeText={setPin}
            />
            <TouchableOpacity style={styles.btnPrimary} onPress={handleMasterLogin}>
              <Text style={styles.btnText}>Login as Admin</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#f8fafc',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 40,
  },
  card: {
    backgroundColor: '#1e293b',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#f8fafc',
    marginBottom: 8,
  },
  cardDesc: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    color: '#f8fafc',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  btnPrimary: {
    backgroundColor: '#ef4444',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnSync: {
    backgroundColor: '#3b82f6',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  }
});
