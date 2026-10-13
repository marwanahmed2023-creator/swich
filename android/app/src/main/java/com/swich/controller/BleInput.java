package com.swich.controller;

import android.annotation.SuppressLint;
import android.bluetooth.*;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.function.Consumer;

@SuppressLint("MissingPermission")
final class BleInput {
    static final UUID SERVICE=UUID.fromString("0000ffe0-0000-1000-8000-00805f9b34fb"), CHARACTERISTIC=UUID.fromString("0000ffe1-0000-1000-8000-00805f9b34fb"), CCCD=UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    private final Handler handler;
    private final Consumer<String> data, status;
    private final Runnable disconnected;
    private BluetoothGatt gatt;
    private boolean closed;
    private final Runnable timeout;
    BleInput(Context context, String address, Handler handler, Consumer<String> data, Consumer<String> status, Runnable disconnected) {
        this.handler=handler; this.data=data; this.status=status; this.disconnected=disconnected;
        timeout=()->fail("Wire connection timed out. Check HM-10 power and try again.");
        BluetoothManager manager=context.getSystemService(BluetoothManager.class);
        BluetoothDevice device=manager.getAdapter().getRemoteDevice(address);
        gatt=device.connectGatt(context,false,callbacks,BluetoothDevice.TRANSPORT_LE);
        handler.postDelayed(timeout,15000);
    }
    private void fail(String message) {
        if(closed)return;
        status.accept(message);close();disconnected.run();
    }
    private final BluetoothGattCallback callbacks=new BluetoothGattCallback(){
        @Override public void onConnectionStateChange(BluetoothGatt g,int status,int state){
            handler.post(()->{
                if(closed)return;
                if(status!=BluetoothGatt.GATT_SUCCESS||state==BluetoothProfile.STATE_DISCONNECTED){fail("Wire disconnected. Reconnect to continue.");return;}
                if(state==BluetoothProfile.STATE_CONNECTED&&!g.discoverServices())fail("Could not read HM-10 services.");
            });
        }
        @Override public void onServicesDiscovered(BluetoothGatt g,int result){
            handler.post(()->{
                if(closed)return;
                BluetoothGattService s=g.getService(SERVICE);
                BluetoothGattCharacteristic c=s==null?null:s.getCharacteristic(CHARACTERISTIC);
                BluetoothGattDescriptor d=c==null?null:c.getDescriptor(CCCD);
                if(result!=BluetoothGatt.GATT_SUCCESS||d==null||!g.setCharacteristicNotification(c,true)){fail("This device does not expose the expected HM-10 FFE0 / FFE1 service.");return;}
                byte[] value=(c.getProperties()&BluetoothGattCharacteristic.PROPERTY_NOTIFY)!=0?BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE:BluetoothGattDescriptor.ENABLE_INDICATION_VALUE;
                boolean accepted;
                if(Build.VERSION.SDK_INT>=33)accepted=g.writeDescriptor(d,value)==BluetoothStatusCodes.SUCCESS;
                else{d.setValue(value);accepted=g.writeDescriptor(d);}
                if(!accepted)fail("Could not enable wire readings.");
            });
        }
        @Override public void onDescriptorWrite(BluetoothGatt g,BluetoothGattDescriptor descriptor,int result){
            handler.post(()->{if(closed)return;if(result!=BluetoothGatt.GATT_SUCCESS){fail("HM-10 rejected notifications.");return;}handler.removeCallbacks(timeout);status.accept("Connected. Release the wire briefly, then tap or hold.");});
        }
        @Override public void onCharacteristicChanged(BluetoothGatt g,BluetoothGattCharacteristic c){receive(c.getUuid(),c.getValue());}
        @Override public void onCharacteristicChanged(BluetoothGatt g,BluetoothGattCharacteristic c,byte[] value){receive(c.getUuid(),value);}
    };
    private void receive(UUID id,byte[] value){
        if(!CHARACTERISTIC.equals(id)||value==null)return;
        String text=new String(value,StandardCharsets.US_ASCII);
        handler.post(()->{if(!closed)data.accept(text);});
    }
    void close(){closed=true;handler.removeCallbacks(timeout);if(gatt!=null){gatt.disconnect();gatt.close();gatt=null;}}
}
