package com.factorytalk.app.ui.screens

import android.app.Activity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.factorytalk.app.R

@Composable
fun LoginScreen(
    onNavigateToHome: () -> Unit,
    viewModel: LoginViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(uiState) {
        if (uiState is LoginUiState.Success) {
            onNavigateToHome()
        }
    }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = stringResource(R.string.login_title),
                style = MaterialTheme.typography.displaySmall,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Bold
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = stringResource(R.string.login_subtitle),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f)
            )
            
            Spacer(modifier = Modifier.height(48.dp))

            when (val state = uiState) {
                is LoginUiState.PhoneInput -> PhoneInputSection(
                    onSendOtp = { phone -> viewModel.sendOtp(phone, context as Activity) }
                )
                is LoginUiState.OtpInput -> OtpInputSection(
                    phoneNumber = viewModel.phoneNumber,
                    onVerify = { code -> viewModel.verifyOtp(code) }
                )
                is LoginUiState.ProfileSetup -> ProfileSetupSection(
                    onSave = { name -> viewModel.saveProfile(name) }
                )
                is LoginUiState.Loading -> LoadingSection(state.message)
                is LoginUiState.Error -> ErrorSection(
                    message = state.message,
                    onRetry = { /* Could add retry logic here */ }
                )
                is LoginUiState.Success -> { /* Navigation handled in LaunchedEffect */ }
            }
        }
    }
}

@Composable
fun PhoneInputSection(onSendOtp: (String) -> Unit) {
    var phone by remember { mutableStateOf("") }
    
    Column(modifier = Modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = phone,
            onValueChange = { phone = it },
            label = { Text(stringResource(R.string.phone_number)) },
            prefix = { Text("+91 ") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Button(
            onClick = { onSendOtp("+91$phone") },
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            enabled = phone.length >= 10
        ) {
            Text(stringResource(R.string.send_otp))
        }
    }
}

@Composable
fun OtpInputSection(phoneNumber: String, onVerify: (String) -> Unit) {
    var code by remember { mutableStateOf("") }
    
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = "Code sent to $phoneNumber",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.primary
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        OutlinedTextField(
            value = code,
            onValueChange = { if (it.length <= 6) code = it },
            label = { Text(stringResource(R.string.enter_otp)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Button(
            onClick = { onVerify(code) },
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            enabled = code.length == 6
        ) {
            Text(stringResource(R.string.verify_otp))
        }
    }
}

@Composable
fun ProfileSetupSection(onSave: (String) -> Unit) {
    var name by remember { mutableStateOf("") }
    
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = "Welcome! Let's set up your profile.",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            label = { Text(stringResource(R.string.display_name)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Button(
            onClick = { onSave(name) },
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            enabled = name.isNotBlank()
        ) {
            Text(stringResource(R.string.save_profile))
        }
    }
}

@Composable
fun LoadingSection(message: String) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth()
    ) {
        CircularProgressIndicator()
        Spacer(modifier = Modifier.height(16.dp))
        Text(text = message)
    }
}

@Composable
fun ErrorSection(message: String, onRetry: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(
            text = message,
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodyLarge,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center
        )
        Spacer(modifier = Modifier.height(16.dp))
        TextButton(onClick = onRetry) {
            Text("Try Again")
        }
    }
}
