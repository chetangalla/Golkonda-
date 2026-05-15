import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Alert, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { loginUser } from '../utils/dataStore';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email) {
      Alert.alert('Missing Field', 'Please enter your email.');
      return;
    }
    
    Keyboard.dismiss();
    
    // Hardcoded Master Admin Login
    if (email.toLowerCase() === 'admin@tourist.com') {
      navigation.replace('Master');
      return;
    }

    setLoading(true);
    try {
      await loginUser(email);
      navigation.replace('Home');
    } catch (err) {
      Alert.alert('Login Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          <Text style={styles.title}>Audio Explorer</Text>
          <Text style={styles.subtitle}>Log in to continue your journey</Text>

          <View style={styles.card}>
            <TextInput 
              style={styles.input} 
              placeholder="Email Address" 
              placeholderTextColor="#94a3b8" 
              keyboardType="email-address" 
              autoCapitalize="none" 
              value={email} 
              onChangeText={setEmail} 
            />
            
            <TouchableOpacity style={styles.btnPrimary} onPress={handleLogin} disabled={loading}>
              <Text style={styles.btnText}>{loading ? 'Authenticating...' : 'Login'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={{ marginTop: 24, alignItems: 'center' }} onPress={() => navigation.navigate('SignUp')}>
            <Text style={{ color: '#94a3b8', fontSize: 16 }}>Don't have an account? <Text style={{ color: '#10b981', fontWeight: 'bold' }}>Sign Up</Text></Text>
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
  btnPrimary: { backgroundColor: '#10b981', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 18, letterSpacing: 0.5 }
});
