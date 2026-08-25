import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { login } from '../utils/dataStore';
import { showAlert } from '../utils/alert';
import { colors, radius, shadow } from '../theme';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      showAlert('Missing Field', 'Please enter your email and password.');
      return;
    }

    Keyboard.dismiss();
    setLoading(true);
    try {
      const result = await login(email, password);
      navigation.replace(result.role === 'admin' ? 'Master' : 'Home');
    } catch (err) {
      showAlert('Login Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  const content = (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>GOLKONDA FORT</Text>
      <Text style={styles.title}>Audio Explorer</Text>
      <Text style={styles.subtitle}>Log in to continue your journey</Text>

      <View style={styles.card}>
        <TextInput
          style={styles.input}
          placeholder="Email Address"
          placeholderTextColor={colors.inkFaint}
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.inkFaint}
          secureTextEntry
          autoCapitalize="none"
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={styles.btnPrimary} onPress={handleLogin} disabled={loading}>
          <Text style={styles.btnText}>{loading ? 'Authenticating...' : 'Login'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={{ marginTop: 24, alignItems: 'center' }} onPress={() => navigation.navigate('SignUp')}>
        <Text style={{ color: colors.inkMuted, fontSize: 16 }}>Don't have an account? <Text style={{ color: colors.accent, fontWeight: 'bold' }}>Sign Up</Text></Text>
      </TouchableOpacity>
    </View>
  );

  if (Platform.OS === 'web') {
    return content;
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        {content}
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'center' },
  eyebrow: { fontSize: 12, fontWeight: '700', color: colors.accent, textAlign: 'center', letterSpacing: 3, marginBottom: 10 },
  title: { fontSize: 36, fontWeight: '800', color: colors.ink, textAlign: 'center', marginBottom: 8, letterSpacing: 0.5 },
  subtitle: { fontSize: 16, color: colors.inkMuted, textAlign: 'center', marginBottom: 40 },
  card: { backgroundColor: colors.card, padding: 24, borderRadius: radius.xxl, borderWidth: 1, borderColor: colors.border, ...shadow('#000', 0.35) },
  input: { backgroundColor: colors.bgSoft, borderWidth: 1, borderColor: colors.border, color: colors.ink, padding: 16, borderRadius: radius.md, marginBottom: 16, fontSize: 16 },
  btnPrimary: { backgroundColor: colors.accent, padding: 16, borderRadius: radius.md, alignItems: 'center', marginTop: 8, ...shadow(colors.accent, 0.35) },
  btnText: { color: colors.accentInk, fontWeight: 'bold', fontSize: 18, letterSpacing: 0.5 }
});
