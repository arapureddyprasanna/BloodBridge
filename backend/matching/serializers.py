from rest_framework import serializers


class DonorMatchSerializer(serializers.Serializer):
    donor_id = serializers.UUIDField()
    blood_group = serializers.CharField()
    distance_km = serializers.FloatField(allow_null=True)
    is_available = serializers.BooleanField()
    max_travel_distance_km = serializers.IntegerField()
    compatibility = serializers.CharField()


class DonorMatchListResponseSerializer(serializers.Serializer):
    blood_request_id = serializers.UUIDField()
    requested_blood_group = serializers.CharField()
    total_matches = serializers.IntegerField()
    results = DonorMatchSerializer(many=True)


class SelectDonorsSerializer(serializers.Serializer):
    donor_ids = serializers.ListField(
        child=serializers.UUIDField(),
        min_length=1,
        max_length=7,
    )


class DonorInvitationSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    donor_id = serializers.UUIDField()
    donor_name = serializers.CharField()
    blood_group = serializers.CharField()
    distance_km = serializers.FloatField()
    status = serializers.CharField()
    selected_at = serializers.DateTimeField()
    responded_at = serializers.DateTimeField(allow_null=True)
    donor_phone = serializers.CharField(allow_null=True, required=False)
