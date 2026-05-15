import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Alert, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { registerUser } from '../utils/dataStore';

export default function SignUpScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!name || !email) {
      Alert.alert('Missing Fields', 'Name and Email are required.');
      return;
    }
    setLoading(true);
    try {
      await registerUser(name, email, phone);
      Alert.alert('Success', 'Account created successfully! Please login.');
      navigation.replace('Login');
    } catch (err) {
      Alert.alert('Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join to continue your journey</Text>

          <View style={styles.card}>
            <TextInput style={styles.input} placeholder="Full Name" placeholderTextColor="#94a3b8" value={name} onChangeText={setName} />
            <TextInput style={styles.input} placeholder="Email Address" placeholderTextColor="#94a3b8" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
            <TextInput style={styles.input} placeholder="Phone Number" placeholderTextColor="#94a3b8" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
            
            <TouchableOpacity style={styles.btnPrimary} onPress={handleSignUp} disabled={loading}>
              <Text style={styles.btnText}>{loading ? 'Registering...' : 'Sign Up'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={{ marginTop: 24, alignItems: 'center' }} onPress={() => navigation.goBack()}>
            <Text style={{ color: '#94a3b8', fontSize: 16 }}>Already have an account? <Text style={{ color: '#3b82f6', fontWeight: 'bold' }}>Login</Text></Text>
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 24, justifyContent: 'center' },
  title: { fontSize: 36, fontWeight: '800', color: '#f8fafc', textAlign: 'center', marginBottom: 8, letterSpacing: 0.5 },
  subtitle: { fontSize: 16, color: '#94a3b8', textAlign: 'center', marginBottom: 40 },
  card: { backgroundColor: 'rgba(30, 41, 59, 0.7)', padding: 24, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(51, 65, 85, 0.8)', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
  input: { backgroundColor: 'rgba(15, 23, 42, 0.6)', borderWidth: 1, borderColor: '#334155', color: '#f8fafc', padding: 16, borderRadius: 12, marginBottom: 16, fontSize: 16 },
  btnPrimary: { backgroundColor: '#3b82f6', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 18, letterSpacing: 0.5 }
});
