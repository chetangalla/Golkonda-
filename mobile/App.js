import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import LoginScreen from './src/screens/LoginScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import HomeScreen from './src/screens/HomeScreen';
import MasterScreen from './src/screens/MasterScreen';
import UserScreen from './src/screens/UserScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      {/* cardStyle: { flex: 1 } matters specifically on web — React Navigation's
          default screen wrapper grows to fit its content (minHeight: 100%,
          not flex: 1), so on a browser it just gets taller than the viewport
          instead of staying bounded. Everything nested inside — including
          each screen's own scrollable list — inherited that unbounded
          growth, which is what was actually blocking scrolling, not
          anything in the screens themselves. Native is unaffected since the
          OS always gives the navigator a fixed screen height regardless. */}
      <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false, cardStyle: { flex: 1 } }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Master" component={MasterScreen} />
        <Stack.Screen name="User" component={UserScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
